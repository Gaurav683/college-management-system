$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$dataDirectory = Join-Path $root "data"
$adminPath = Join-Path $dataDirectory "admin.json"
$recordsPath = Join-Path $dataDirectory "attendance.json"
if (-not (Test-Path $dataDirectory)) {
    New-Item -ItemType Directory -Path $dataDirectory | Out-Null
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:8000/")
$sessions = @{}
$failedLogins = 0
$lockedUntil = [DateTime]::MinValue
$sessionLifetime = [TimeSpan]::FromHours(8)
$allowedStaticFiles = @{
    "/" = @{ Path = "index.html"; Type = "text/html; charset=utf-8" }
    "/index.html" = @{ Path = "index.html"; Type = "text/html; charset=utf-8" }
    "/styles.css" = @{ Path = "styles.css"; Type = "text/css; charset=utf-8" }
    "/app.js" = @{ Path = "app.js"; Type = "text/javascript; charset=utf-8" }
}

function Send-Json($Context, [int]$StatusCode, $Value) {
    $Context.Response.StatusCode = $StatusCode
    $Context.Response.ContentType = "application/json; charset=utf-8"
    $bytes = [System.Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -InputObject $Value -Depth 100 -Compress))
    $Context.Response.ContentLength64 = $bytes.Length
    $Context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
}

function Send-Text($Context, [int]$StatusCode, [string]$Text) {
    Send-Json $Context $StatusCode @{ error = $Text }
}

function Read-Json($Context) {
    if ($Context.Request.ContentLength64 -gt 5242880) {
        throw "Request is too large."
    }
    $reader = New-Object System.IO.StreamReader($Context.Request.InputStream, $Context.Request.ContentEncoding)
    try {
        $body = $reader.ReadToEnd()
    }
    finally {
        $reader.Dispose()
    }
    if ([string]::IsNullOrWhiteSpace($body)) {
        throw "A JSON request body is required."
    }
    return ConvertFrom-Json -InputObject $body
}

function Save-JsonFile([string]$Path, $Value) {
    $temporaryPath = "$Path.tmp"
    $json = ConvertTo-Json -InputObject $Value -Depth 100
    [System.IO.File]::WriteAllText($temporaryPath, $json, (New-Object System.Text.UTF8Encoding($false)))
    Move-Item -LiteralPath $temporaryPath -Destination $Path -Force
}

function New-PasswordRecord([string]$Password) {
    $salt = New-Object byte[] 16
    $random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $random.GetBytes($salt)
    }
    finally {
        $random.Dispose()
    }
    $derive = [System.Security.Cryptography.Rfc2898DeriveBytes]::new(
        $Password,
        $salt,
        210000,
        [System.Security.Cryptography.HashAlgorithmName]::SHA256
    )
    try {
        $hash = $derive.GetBytes(32)
    }
    finally {
        $derive.Dispose()
    }
    return @{
        salt = [Convert]::ToBase64String($salt)
        hash = [Convert]::ToBase64String($hash)
        iterations = 210000
    }
}

function Test-Password([string]$Password, $Record) {
    $salt = [Convert]::FromBase64String($Record.salt)
    $expected = [Convert]::FromBase64String($Record.hash)
    $derive = [System.Security.Cryptography.Rfc2898DeriveBytes]::new(
        $Password,
        $salt,
        [int]$Record.iterations,
        [System.Security.Cryptography.HashAlgorithmName]::SHA256
    )
    try {
        $actual = $derive.GetBytes($expected.Length)
    }
    finally {
        $derive.Dispose()
    }
    $difference = 0
    for ($index = 0; $index -lt $expected.Length; $index++) {
        $difference = $difference -bor ($expected[$index] -bxor $actual[$index])
    }
    return $difference -eq 0
}

function Get-SessionKey($Context) {
    $cookie = $Context.Request.Cookies["campusmark_session"]
    if (-not $cookie -or [string]::IsNullOrWhiteSpace($cookie.Value)) {
        return $null
    }
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($cookie.Value)
        $key = [Convert]::ToBase64String($sha.ComputeHash($bytes))
    }
    finally {
        $sha.Dispose()
    }
    if (-not $sessions.ContainsKey($key)) {
        return $null
    }
    if ($sessions[$key] -lt [DateTime]::UtcNow) {
        $sessions.Remove($key)
        return $null
    }
    return $key
}

function Set-SessionCookie($Context) {
    $randomBytes = New-Object byte[] 32
    $random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $random.GetBytes($randomBytes)
    }
    finally {
        $random.Dispose()
    }
    $token = [Convert]::ToBase64String($randomBytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $key = [Convert]::ToBase64String($sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($token)))
    }
    finally {
        $sha.Dispose()
    }
    $sessions[$key] = [DateTime]::UtcNow.Add($sessionLifetime)
    $Context.Response.Headers.Add("Set-Cookie", "campusmark_session=$token; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800")
}

function Clear-SessionCookie($Context) {
    $key = Get-SessionKey $Context
    if ($key) {
        $sessions.Remove($key)
    }
    $Context.Response.Headers.Add("Set-Cookie", "campusmark_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0")
}

function Test-LocalOrigin($Context) {
    return $Context.Request.Headers["Origin"] -eq "http://127.0.0.1:8000"
}

function Test-Authenticated($Context) {
    return $null -ne (Get-SessionKey $Context)
}

function Send-StaticFile($Context, $Entry) {
    $path = Join-Path $root $Entry.Path
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        Send-Text $Context 404 "File not found."
        return
    }
    $bytes = [System.IO.File]::ReadAllBytes($path)
    $Context.Response.StatusCode = 200
    $Context.Response.ContentType = $Entry.Type
    $Context.Response.ContentLength64 = $bytes.Length
    $Context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
}

$listener.Start()
Write-Host "CampusMark is running at http://127.0.0.1:8000"
Write-Host "Keep this window open while using the app. Press Ctrl+C to stop."

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $context.Response.Headers["X-Content-Type-Options"] = "nosniff"
        $context.Response.Headers["X-Frame-Options"] = "DENY"
        $context.Response.Headers["Referrer-Policy"] = "no-referrer"
        $context.Response.Headers["Cache-Control"] = "no-store"
        $path = $context.Request.Url.AbsolutePath
        $method = $context.Request.HttpMethod

        try {
            if ($path -eq "/api/auth-state" -and $method -eq "GET") {
                $isSetup = -not (Test-Path -LiteralPath $adminPath -PathType Leaf)
                $isAuthenticated = (-not $isSetup) -and (Test-Authenticated $context)
                Send-Json $context 200 @{ setupRequired = $isSetup; authenticated = $isAuthenticated }
            }
            elseif ($path -eq "/api/setup" -and $method -eq "POST") {
                if (-not (Test-LocalOrigin $context)) {
                    Send-Text $context 403 "Request origin was not allowed."
                }
                elseif (Test-Path -LiteralPath $adminPath -PathType Leaf) {
                    Send-Text $context 409 "Admin account is already set up. Please sign in."
                }
                else {
                    $body = Read-Json $context
                    $username = ([string]$body.username).Trim()
                    $password = [string]$body.password
                    if ($username.Length -lt 3 -or $username.Length -gt 40 -or $username -notmatch "^[A-Za-z0-9._-]+$") {
                        Send-Text $context 400 "Username must be 3-40 characters and use letters, numbers, dot, underscore or hyphen."
                    }
                    elseif ($password.Length -lt 12 -or $password.Length -gt 128) {
                        Send-Text $context 400 "Use a password between 12 and 128 characters."
                    }
                    else {
                        $passwordRecord = New-PasswordRecord $password
                        Save-JsonFile $adminPath @{ username = $username; salt = $passwordRecord.salt; hash = $passwordRecord.hash; iterations = $passwordRecord.iterations }
                        Set-SessionCookie $context
                        Send-Json $context 200 @{ ok = $true }
                    }
                }
            }
            elseif ($path -eq "/api/login" -and $method -eq "POST") {
                if (-not (Test-LocalOrigin $context)) {
                    Send-Text $context 403 "Request origin was not allowed."
                }
                elseif (-not (Test-Path -LiteralPath $adminPath -PathType Leaf)) {
                    Send-Text $context 409 "Create the admin account first."
                }
                elseif ([DateTime]::UtcNow -lt $lockedUntil) {
                    Send-Text $context 429 "Too many sign-in attempts. Try again in one minute."
                }
                else {
                    $body = Read-Json $context
                    $admin = Get-Content -LiteralPath $adminPath -Raw | ConvertFrom-Json
                    if (([string]$body.username).Trim() -eq $admin.username -and (Test-Password ([string]$body.password) $admin)) {
                        $failedLogins = 0
                        $lockedUntil = [DateTime]::MinValue
                        Set-SessionCookie $context
                        Send-Json $context 200 @{ ok = $true }
                    }
                    else {
                        $failedLogins++
                        if ($failedLogins -ge 5) {
                            $failedLogins = 0
                            $lockedUntil = [DateTime]::UtcNow.AddMinutes(1)
                        }
                        Send-Text $context 401 "Incorrect username or password."
                    }
                }
            }
            elseif ($path -eq "/api/logout" -and $method -eq "POST") {
                if (-not (Test-LocalOrigin $context)) {
                    Send-Text $context 403 "Request origin was not allowed."
                }
                else {
                    Clear-SessionCookie $context
                    Send-Json $context 200 @{ ok = $true }
                }
            }
            elseif ($path -eq "/api/data" -and $method -eq "GET") {
                if (-not (Test-Authenticated $context)) {
                    Send-Text $context 401 "Sign in to access attendance data."
                }
                elseif (Test-Path -LiteralPath $recordsPath -PathType Leaf) {
                    $savedData = Get-Content -LiteralPath $recordsPath -Raw | ConvertFrom-Json
                    Send-Json $context 200 @{ data = $savedData }
                }
                else {
                    Send-Json $context 200 @{ data = $null }
                }
            }
            elseif ($path -eq "/api/data" -and $method -eq "PUT") {
                if (-not (Test-LocalOrigin $context)) {
                    Send-Text $context 403 "Request origin was not allowed."
                }
                elseif (-not (Test-Authenticated $context)) {
                    Send-Text $context 401 "Sign in to save attendance data."
                }
                else {
                    $body = Read-Json $context
                    if ($null -eq $body.students -or $null -eq $body.courses -or $null -eq $body.attendance) {
                        Send-Text $context 400 "Student, course and attendance lists are required."
                    }
                    elseif (@($body.attendance | Where-Object { $_.status -notin @("present", "absent") }).Count -gt 0) {
                        Send-Text $context 400 "Attendance status must be present or absent."
                    }
                    else {
                        Save-JsonFile $recordsPath $body
                        Send-Json $context 200 @{ ok = $true }
                    }
                }
            }
            elseif ($method -eq "GET" -and $allowedStaticFiles.ContainsKey($path)) {
                Send-StaticFile $context $allowedStaticFiles[$path]
            }
            else {
                Send-Text $context 404 "Not found."
            }
        }
        catch {
            Write-Host ("Request error: " + $_.Exception.Message) -ForegroundColor Yellow
            $context.Response.Abort()
        }
        finally {
            $context.Response.Close()
        }
    }
}
finally {
    $listener.Stop()
    $listener.Close()
}
