const STORAGE_KEY = "campusmark-data-v1";

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const seedData = () => {
  const date = today();
  const students = [
    { id: "s1", name: "Olivia Bennett", roll: "CS2024001", department: "Computer Science", semester: "4", email: "olivia.b@northfield.edu" },
    { id: "s2", name: "Ethan Parker", roll: "CS2024002", department: "Computer Science", semester: "4", email: "ethan.p@northfield.edu" },
    { id: "s3", name: "Sophia Chen", roll: "CS2024003", department: "Computer Science", semester: "4", email: "sophia.c@northfield.edu" },
    { id: "s4", name: "Liam Johnson", roll: "CS2024004", department: "Computer Science", semester: "4", email: "liam.j@northfield.edu" },
    { id: "s5", name: "Ava Rodriguez", roll: "BA2024001", department: "Business Administration", semester: "4", email: "ava.r@northfield.edu" },
    { id: "s6", name: "Noah Williams", roll: "BA2024002", department: "Business Administration", semester: "4", email: "noah.w@northfield.edu" },
    { id: "s7", name: "Isabella Kim", roll: "CS2023001", department: "Computer Science", semester: "6", email: "isabella.k@northfield.edu" },
    { id: "s8", name: "Mason Patel", roll: "CS2023002", department: "Computer Science", semester: "6", email: "mason.p@northfield.edu" }
  ];
  const courses = [
    { id: "c1", code: "CS 204", name: "Data Structures & Algorithms", department: "Computer Science", semester: "4", instructor: "Dr. Emily Carter", time: "09:00 AM" },
    { id: "c2", code: "CS 206", name: "Database Management Systems", department: "Computer Science", semester: "4", instructor: "Prof. Michael Reed", time: "11:30 AM" },
    { id: "c3", code: "BA 202", name: "Principles of Marketing", department: "Business Administration", semester: "4", instructor: "Dr. Sarah Mitchell", time: "10:00 AM" },
    { id: "c4", code: "CS 301", name: "Operating Systems", department: "Computer Science", semester: "6", instructor: "Prof. Daniel Brooks", time: "02:00 PM" }
  ];
  const attendance = [
    ["s1", "present"], ["s2", "present"], ["s3", "absent"], ["s4", "absent"]
  ].map(([studentId, status]) => ({ date, courseId: "c1", studentId, status }));
  return { students, courses, attendance };
};

function loadData() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return seedData();
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed.students) || !Array.isArray(parsed.courses) || !Array.isArray(parsed.attendance)) {
      throw new Error("Saved attendance data has an invalid format.");
    }
    return parsed;
  } catch (error) {
    console.error("Could not load saved campus data:", error);
    return seedData();
  }
}

let data = { students: [], courses: [], attendance: [] };
let authenticated = false;
let reportFilters = {};
let activePage = "dashboard";
let attendanceDate = today();
let selectedCourseId = data.courses[0]?.id || "";
let toastTimer;

const pageContent = document.getElementById("pageContent");
const modal = document.getElementById("modal");
const toast = document.getElementById("toast");
const pageNames = { dashboard: "Overview", attendance: "Take attendance", students: "Students", courses: "Courses", reports: "Reports" };

async function saveData() {
  if (!authenticated) {
    showToast("Sign in to save changes.");
    return false;
  }
  try {
    const response = await fetch("/api/data", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    if (response.status === 401) {
      authenticated = false;
      renderAuth({ setupRequired: false });
      return false;
    }
    if (!response.ok) throw new Error(`Server returned ${response.status}`);
  } catch (error) {
    console.error("Could not save campus data:", error);
    showToast("Couldn't save changes. Check that the attendance server is running.");
    return false;
  }
  return true;
}

async function commitData(update) {
  const previous = JSON.stringify(data);
  update();
  if (await saveData()) return true;
  if (authenticated) {
    data = JSON.parse(previous);
    render(activePage);
  }
  return false;
}

async function apiRequest(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Request failed.");
  return result;
}

function renderAuth({ setupRequired, error = "" }) {
  authenticated = false;
  data = { students: [], courses: [], attendance: [] };
  selectedCourseId = "";
  document.querySelector(".app-shell").classList.add("hidden");
  const isSetup = Boolean(setupRequired);
  document.getElementById("authGate").innerHTML = `<section class="auth-card">
    <a class="brand auth-brand" href="#"><span class="brand-mark"><span></span><span></span><span></span><span></span></span><span>campus<span class="brand-light">mark</span></span></a>
    <div class="auth-icon">${isSetup ? "✦" : "🔒"}</div>
    <p class="eyebrow">NORTHFIELD COLLEGE · ADMIN PORTAL</p>
    <h1>${isSetup ? "Create your admin account" : "Admin sign in"}</h1>
    <p class="auth-description">${isSetup ? "First-time setup: create the account that controls attendance access." : "Sign in to manage students and mark attendance."}</p>
    <form id="authForm" class="auth-form">
      <label class="field"><span>USERNAME</span><input name="username" required autocomplete="username" minlength="3" maxlength="40" autofocus /></label>
      <label class="field"><span>${isSetup ? "PASSWORD (12+ CHARACTERS)" : "PASSWORD"}</span><input name="password" type="password" required autocomplete="${isSetup ? "new-password" : "current-password"}" minlength="${isSetup ? "12" : "1"}" maxlength="128" /></label>
      ${isSetup ? `<label class="field"><span>CONFIRM PASSWORD</span><input name="confirmPassword" type="password" required autocomplete="new-password" minlength="12" maxlength="128" /></label>` : ""}
      ${error ? `<p class="auth-error" role="alert">${escapeHTML(error)}</p>` : ""}
      <button class="button button-primary auth-submit" type="submit">${isSetup ? "Create admin account" : "Sign in"}</button>
    </form>
    <p class="auth-note">Local secure access · Only this computer can connect</p>
  </section>`;
  document.getElementById("authGate").classList.remove("hidden");
}

async function initializeApp() {
  try {
    const response = await fetch("/api/auth-state");
    if (!response.ok) throw new Error(`Server returned ${response.status}`);
    const auth = await response.json();
    if (!auth.authenticated) {
      renderAuth(auth);
      return;
    }
    await loadServerData();
  } catch (error) {
    console.error("Could not connect to attendance server:", error);
    renderAuth({ setupRequired: false, error: "Cannot connect to the server. Open the app using start.bat." });
  }
}

async function loadServerData() {
  const response = await fetch("/api/data");
  if (response.status === 401) {
    renderAuth({ setupRequired: false });
    return;
  }
  if (!response.ok) throw new Error(`Could not load data (${response.status}).`);
  authenticated = true;
  const result = await response.json();
  if (result.data) {
    data = result.data;
    let migrated = false;
    data.attendance.forEach((record) => {
      if (record.status === "late") {
        record.status = "absent";
        migrated = true;
      }
    });
    if (migrated && !(await saveData())) throw new Error("Could not update older attendance records.");
  } else {
    data = loadData();
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const imported = JSON.parse(saved);
        if (Array.isArray(imported.students) && Array.isArray(imported.courses) && Array.isArray(imported.attendance)) data = imported;
      } catch (error) {
        console.error("Could not import previous browser data:", error);
      }
    }
    data.attendance.forEach((record) => {
      if (record.status === "late") record.status = "absent";
    });
    if (!(await saveData())) throw new Error("Could not initialize attendance data.");
    localStorage.removeItem(STORAGE_KEY);
  }
  selectedCourseId = data.courses[0]?.id || "";
  authenticated = true;
  document.getElementById("authGate").classList.add("hidden");
  document.querySelector(".app-shell").classList.remove("hidden");
  render("dashboard");
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function initials(name) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase();
}

function formatDate(value, options = { month: "short", day: "numeric", year: "numeric" }) {
  if (!value) return "—";
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-US", options);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
}

function getCourse(id) {
  return data.courses.find((course) => course.id === id);
}

function getRoster(course) {
  if (!course) return [];
  return data.students.filter((student) => student.department === course.department && student.semester === course.semester);
}

function getRecord(date, courseId, studentId) {
  return data.attendance.find((item) => item.date === date && item.courseId === courseId && item.studentId === studentId);
}

function statusPill(status) {
  const label = status ? status[0].toUpperCase() + status.slice(1) : "Not marked";
  return `<span class="pill ${status ? `pill-${status}` : "pill-empty"}">${label}</span>`;
}

function heading(title, subtitle, actions = "") {
  const now = new Date();
  const yearStart = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  const academicYear = `${yearStart}–${String(yearStart + 1).slice(-2)}`;
  return `<div class="page-heading"><div><p class="eyebrow">NORTHFIELD COLLEGE · ACADEMIC YEAR ${academicYear}</p><h1>${title}</h1><p class="heading-subtitle">${subtitle}</p></div>${actions ? `<div class="heading-actions">${actions}</div>` : ""}</div>`;
}

function button(label, action, primary = false, icon = "") {
  return `<button class="button ${primary ? "button-primary" : ""}" data-action="${action}">${icon ? `<span class="button-icon">${icon}</span>` : ""}${label}</button>`;
}

function statCard(label, value, note, icon, color = "") {
  return `<article class="stat-card"><div class="stat-top"><span>${label}</span><span class="stat-icon ${color}">${icon}</span></div><div class="stat-value">${value}</div><div class="stat-foot">${note}</div></article>`;
}

function renderDashboard() {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const rostered = data.students.length;
  const markedToday = data.attendance.filter((item) => item.date === today());
  const presentToday = markedToday.filter((item) => item.status === "present").length;
  const overall = data.attendance.length ? Math.round((data.attendance.filter((item) => item.status === "present").length / data.attendance.length) * 100) : 0;
  const courseSummaries = data.courses.map((course) => {
    const records = data.attendance.filter((item) => item.courseId === course.id && item.date === today());
    const marked = records.length;
    const present = records.filter((item) => item.status === "present").length;
    return { course, marked, rate: marked ? Math.round((present / marked) * 100) : null };
  }).sort((a, b) => (b.marked - a.marked) || a.course.time.localeCompare(b.course.time)).slice(0, 4);
  const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const lines = weekdayLabels.map((_, index) => {
    const date = new Date();
    const mondayOffset = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - mondayOffset + index);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const items = data.attendance.filter((record) => record.date === key);
    return items.length ? Math.round(items.filter((record) => record.status === "present").length / items.length * 100) : 0;
  });
  const points = (values) => values.map((value, index) => `${45 + index * 75},${145 - (value || 0) * 1.15}`).join(" ");
  const chart = `<svg class="chart-svg" viewBox="0 0 510 185" role="img" aria-label="Attendance rate this week">
    <defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#7566df" stop-opacity=".16"/><stop offset="100%" stop-color="#7566df" stop-opacity="0"/></linearGradient></defs>
    <line class="chart-grid" x1="37" y1="30" x2="495" y2="30"/><line class="chart-grid" x1="37" y1="73" x2="495" y2="73"/><line class="chart-grid" x1="37" y1="116" x2="495" y2="116"/><line class="chart-grid" x1="37" y1="159" x2="495" y2="159"/>
    <text class="chart-label" x="3" y="33">100%</text><text class="chart-label" x="11" y="76">75%</text><text class="chart-label" x="11" y="119">50%</text><text class="chart-label" x="11" y="162">25%</text>
    <polygon class="chart-area" points="45,159 ${points(lines)} 495,159"/><polyline class="chart-line secondary" points="${points(lines.map((v) => v ? Math.min(v + 7, 100) : 0))}"/><polyline class="chart-line" points="${points(lines)}"/>
    ${lines.map((value, index) => `<circle class="chart-dot" cx="${45 + index * 75}" cy="${145 - (value || 0) * 1.15}" r="3.5"/>`).join("")}
    ${weekdayLabels.map((label, index) => `<text class="chart-label" x="${45 + index * 75}" y="178" text-anchor="middle">${label}</text>`).join("")}
  </svg>`;
  const recent = courseSummaries.length ? courseSummaries.map(({ course, marked, rate }, index) => `<div class="recent-item"><div class="course-mini ${["", "green", "orange", "blue"][index]}">${escapeHTML(course.code.split(" ")[0])}</div><div class="recent-copy"><strong>${escapeHTML(course.name)}</strong><span>${escapeHTML(course.code)} · ${escapeHTML(course.time)}</span></div><div class="recent-rate">${rate === null ? "—" : `${rate}%`}<small>${marked ? `${marked} marked` : "Not started"}</small></div></div>`).join("") : `<div class="empty-state">Add a course to see class activity.</div>`;
  const recentRecords = data.attendance.filter((item) => item.date === today()).slice(-5).reverse();
  const activityRows = recentRecords.map((record) => {
    const student = data.students.find((item) => item.id === record.studentId);
    const course = getCourse(record.courseId);
    return student && course ? `<tr><td><div class="student-cell"><span class="student-avatar">${escapeHTML(initials(student.name))}</span>${escapeHTML(student.name)}</div></td><td>${escapeHTML(student.roll)}</td><td>${escapeHTML(course.code)} · ${escapeHTML(course.name)}</td><td>${statusPill(record.status)}</td><td>${formatDate(record.date, { month: "short", day: "numeric" })}</td></tr>` : "";
  }).join("");
  return `${heading(`${greeting}, Alexandra 👋`, "Here’s what’s happening across your campus today.", `${button("Export report", "export-today")} ${button("Take attendance", "goto-attendance", true, "+")}`)}
    <section class="stats-grid">
      ${statCard("Total students", rostered, `<span class="positive">Active roster</span> · across all courses`, "♙")}
      ${statCard("Attendance today", `${presentToday}<span style="font-size:13px;color:#9299a8;font-weight:500"> / ${markedToday.length || 0}</span>`, `${markedToday.length ? `${Math.round(presentToday / markedToday.length * 100)}% present so far` : "No attendance marked yet"}`, "✓", "green")}
      ${statCard("Overall attendance", `${overall}%`, "Based on all saved sessions", "◔", "orange")}
      ${statCard("Active courses", data.courses.length, "Across all departments", "▤", "pink")}
    </section>
    <section class="dashboard-grid">
      <article class="panel"><div class="panel-header"><div><h2 class="panel-title">Attendance overview</h2><p class="panel-description">Daily attendance rate for this week</p></div><div class="chart-legend"><span><i class="legend-dot"></i>Present</span><span><i class="legend-dot secondary"></i>Trend</span></div></div><div class="chart-wrap">${chart}</div></article>
      <article class="panel"><div class="panel-header"><div><h2 class="panel-title">Today’s classes</h2><p class="panel-description">${formatDate(today(), { weekday: "long", month: "long", day: "numeric" })}</p></div><button class="text-link" data-page="courses">View all</button></div><div class="recent-list">${recent}</div></article>
    </section>
    <section class="panel table-panel"><div class="panel-header"><div><h2 class="panel-title">Recent attendance</h2><p class="panel-description">Latest student attendance records</p></div><button class="text-link" data-page="reports">View reports&nbsp; →</button></div>
      <div class="table-wrap"><table><thead><tr><th>STUDENT</th><th>ROLL NUMBER</th><th>COURSE</th><th>STATUS</th><th>DATE</th></tr></thead><tbody>${activityRows || `<tr><td colspan="5"><div class="empty-state"><strong>No attendance recorded yet</strong>Take attendance to see recent activity here.</div></td></tr>`}</tbody></table></div></section>`;
}

function renderAttendance() {
  const course = getCourse(selectedCourseId);
  const roster = getRoster(course);
  const records = roster.map((student) => ({ student, record: getRecord(attendanceDate, selectedCourseId, student.id) }));
  const counts = { present: 0, absent: 0 };
  records.forEach(({ record }) => { if (record) counts[record.status] += 1; });
  const courseOptions = data.courses.map((item) => `<option value="${escapeHTML(item.id)}" ${item.id === selectedCourseId ? "selected" : ""}>${escapeHTML(item.code)} — ${escapeHTML(item.name)}</option>`).join("");
  const rows = records.map(({ student, record }, index) => `<tr><td><div class="student-cell"><span class="student-avatar alt-${index % 4}">${escapeHTML(initials(student.name))}</span>${escapeHTML(student.name)}</div></td><td>${escapeHTML(student.roll)}</td><td>${escapeHTML(student.department)}</td><td>${escapeHTML(student.semester)}</td><td>${record ? statusPill(record.status) : statusPill(null)}</td><td><div class="status-actions">${["present", "absent"].map((status) => `<button class="status-button ${status} ${record?.status === status ? "selected" : ""}" data-action="mark" data-student="${escapeHTML(student.id)}" data-status="${status}">${status[0].toUpperCase() + status.slice(1)}</button>`).join("")}</div></td></tr>`).join("");
  const sessionSaved = data.attendance.some((item) => item.date === attendanceDate && item.courseId === selectedCourseId);
  return `${heading("Take attendance", "Record and manage daily class attendance.", `${button("View reports", "goto-reports")} ${button("Save attendance", "save-attendance", true, "✓")}`)}
    <section class="panel">
      <div class="attendance-controls">
        <div class="field grow"><label for="attendanceCourse">COURSE</label><select id="attendanceCourse" ${data.courses.length ? "" : "disabled"}>${courseOptions || `<option value="">No courses available</option>`}</select></div>
        <div class="field"><label for="attendanceDate">CLASS DATE</label><input id="attendanceDate" type="date" value="${attendanceDate}" /></div>
        <div class="attendance-summary"><strong>${counts.present} present</strong>&nbsp; · &nbsp;${counts.absent} absent&nbsp; · &nbsp;${roster.length} students</div>
      </div>
      ${course ? `<div class="table-wrap"><table><thead><tr><th>STUDENT</th><th>ROLL NUMBER</th><th>DEPARTMENT</th><th>SEMESTER</th><th>STATUS</th><th>MARK ATTENDANCE</th></tr></thead><tbody>${rows || `<tr><td colspan="6"><div class="empty-state"><strong>No students in this course</strong>Add students in ${escapeHTML(course.department)}, semester ${escapeHTML(course.semester)}.</div></td></tr>`}</tbody></table></div>` : `<div class="empty-state"><strong>No courses yet</strong>Add a course to begin taking attendance.</div>`}
      <div class="attendance-actions"><button class="button" data-action="mark-all" data-status="present" ${roster.length ? "" : "disabled"}>Mark all present</button><button class="button" data-action="clear-session" ${sessionSaved ? "" : "disabled"}>Clear session</button><span class="attendance-summary">${sessionSaved ? "Changes are saved automatically." : "Mark each student, then save this session."}</span></div>
    </section>`;
}

function renderStudents(search = "") {
  const query = search.trim().toLowerCase();
  const students = data.students.filter((student) => `${student.name} ${student.roll} ${student.department} ${student.email}`.toLowerCase().includes(query));
  const rows = students.map((student, index) => `<tr><td><div class="student-cell"><span class="student-avatar alt-${index % 4}">${escapeHTML(initials(student.name))}</span>${escapeHTML(student.name)}</div></td><td>${escapeHTML(student.roll)}</td><td>${escapeHTML(student.department)}</td><td>${escapeHTML(student.semester)}</td><td>${escapeHTML(student.email || "—")}</td><td><button class="row-action" aria-label="Edit ${escapeHTML(student.name)}" data-action="edit-student" data-id="${escapeHTML(student.id)}">✎</button><button class="row-action" aria-label="Delete ${escapeHTML(student.name)}" data-action="delete-student" data-id="${escapeHTML(student.id)}">×</button></td></tr>`).join("");
  return `${heading("Students", "Manage your student directory and class enrollment.", button("Add student", "add-student", true, "+"))}
    <section class="panel table-panel" style="margin-top:0"><div class="panel-header"><div><h2 class="panel-title">All students <span style="color:#9aa0ae;font-weight:500">(${data.students.length})</span></h2><p class="panel-description">Students are matched to courses by department and semester.</p></div><div class="table-tools"><div class="search-box"><input id="studentSearch" type="search" placeholder="Search students..." value="${escapeHTML(search)}" aria-label="Search students" /></div></div></div>
    <div class="table-wrap"><table><thead><tr><th>STUDENT</th><th>ROLL NUMBER</th><th>DEPARTMENT</th><th>SEMESTER</th><th>EMAIL</th><th>ACTIONS</th></tr></thead><tbody>${rows || `<tr><td colspan="6"><div class="empty-state"><strong>${data.students.length ? "No students found" : "No students yet"}</strong>${data.students.length ? "Try a different search." : "Add a student to build your roster."}</div></td></tr>`}</tbody></table></div></section>`;
}

function renderCourses() {
  const rows = data.courses.map((course) => {
    const count = getRoster(course).length;
    const attendance = data.attendance.filter((item) => item.courseId === course.id);
    const rate = attendance.length ? `${Math.round(attendance.filter((item) => item.status === "present").length / attendance.length * 100)}%` : "—";
    return `<tr><td><strong>${escapeHTML(course.code)}</strong><div style="font-size:9px;color:#9299a8;font-weight:400;margin-top:3px">${escapeHTML(course.name)}</div></td><td>${escapeHTML(course.department)}</td><td>${escapeHTML(course.semester)}</td><td>${escapeHTML(course.instructor)}</td><td>${escapeHTML(course.time)}</td><td>${count}</td><td>${rate}</td><td><button class="row-action" aria-label="Delete ${escapeHTML(course.code)}" data-action="delete-course" data-id="${escapeHTML(course.id)}">×</button></td></tr>`;
  }).join("");
  return `${heading("Courses", "Set up classes, instructors, and course rosters.", button("Add course", "add-course", true, "+"))}
    <section class="panel table-panel" style="margin-top:0"><div class="panel-header"><div><h2 class="panel-title">Course directory <span style="color:#9aa0ae;font-weight:500">(${data.courses.length})</span></h2><p class="panel-description">Students are automatically rostered by department and semester.</p></div></div>
    <div class="table-wrap"><table><thead><tr><th>COURSE</th><th>DEPARTMENT</th><th>SEMESTER</th><th>INSTRUCTOR</th><th>CLASS TIME</th><th>STUDENTS</th><th>ATTENDANCE</th><th>ACTIONS</th></tr></thead><tbody>${rows || `<tr><td colspan="8"><div class="empty-state"><strong>No courses yet</strong>Add a course to organize your attendance.</div></td></tr>`}</tbody></table></div></section>`;
}

function renderReports(filters = {}) {
  const date = filters.date ?? "";
  const courseId = filters.courseId ?? "";
  const filtered = data.attendance.filter((item) => (!date || item.date === date) && (!courseId || item.courseId === courseId));
  const count = (status) => filtered.filter((item) => item.status === status).length;
  const rate = filtered.length ? Math.round(count("present") / filtered.length * 100) : 0;
  const courseOptions = `<option value="">All courses</option>${data.courses.map((course) => `<option value="${escapeHTML(course.id)}" ${course.id === courseId ? "selected" : ""}>${escapeHTML(course.code)} — ${escapeHTML(course.name)}</option>`).join("")}`;
  const rows = filtered.slice().sort((a, b) => b.date.localeCompare(a.date)).map((item) => {
    const student = data.students.find((entry) => entry.id === item.studentId);
    const course = getCourse(item.courseId);
    return student && course ? `<tr><td>${formatDate(item.date)}</td><td>${escapeHTML(course.code)} · ${escapeHTML(course.name)}</td><td><div class="student-cell"><span class="student-avatar">${escapeHTML(initials(student.name))}</span>${escapeHTML(student.name)}</div></td><td>${escapeHTML(student.roll)}</td><td>${statusPill(item.status)}</td></tr>` : "";
  }).join("");
  return `${heading("Attendance reports", "Review attendance records and export filtered data.", button("Export CSV", "export-report", true, "↓"))}
    <section class="report-summary">${statCard("Attendance rate", `${rate}%`, "For current filters", "◔", "green")}${statCard("Present", count("present"), "Students marked present", "✓")}${statCard("Absent", count("absent"), "Students marked absent", "!", "orange")}</section>
    <section class="panel table-panel" style="margin-top:0"><div class="panel-header"><div><h2 class="panel-title">Attendance records</h2><p class="panel-description">${filtered.length} record${filtered.length === 1 ? "" : "s"} found</p></div><div class="table-tools"><input class="filter-select" id="reportDate" type="date" value="${escapeHTML(date)}" aria-label="Filter by date" /><select class="filter-select" id="reportCourse" aria-label="Filter by course">${courseOptions}</select><button class="button" data-action="clear-report-filters">Reset</button></div></div>
    <div class="table-wrap"><table><thead><tr><th>DATE</th><th>COURSE</th><th>STUDENT</th><th>ROLL NUMBER</th><th>STATUS</th></tr></thead><tbody>${rows || `<tr><td colspan="5"><div class="empty-state"><strong>No records found</strong>Change the filters or take attendance to create records.</div></td></tr>`}</tbody></table></div></section>`;
}

function render(page = activePage, options = {}) {
  activePage = page;
  document.getElementById("breadcrumbCurrent").textContent = pageNames[page];
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.page === page));
  if (page === "dashboard") pageContent.innerHTML = renderDashboard();
  if (page === "attendance") pageContent.innerHTML = renderAttendance();
  if (page === "students") pageContent.innerHTML = renderStudents(options.search || "");
  if (page === "courses") pageContent.innerHTML = renderCourses();
  if (page === "reports") pageContent.innerHTML = renderReports(options.filters || {});
}

function openModal(title, subtitle, body) {
  modal.innerHTML = `<div class="modal-header"><div><h2>${title}</h2><p>${subtitle}</p></div><button class="modal-close" type="button" aria-label="Close dialog">×</button></div>${body}`;
  modal.showModal();
  modal.querySelector(".modal-close").addEventListener("click", () => modal.close());
}

function studentForm(student = {}) {
  const editing = Boolean(student.id);
  const departments = [...new Set([...data.students.map((item) => item.department), ...data.courses.map((item) => item.department), "Computer Science", "Business Administration", "Arts & Humanities", "Engineering"])].sort();
  const departmentOptions = departments.map((department) => `<option value="${escapeHTML(department)}" ${student.department === department ? "selected" : ""}>${escapeHTML(department)}</option>`).join("");
  openModal(editing ? "Edit student" : "Add student", "Enter the student’s details below.", `<form class="modal-form" id="studentForm" data-id="${escapeHTML(student.id || "")}">
    <div class="field"><label for="studentName">FULL NAME</label><input id="studentName" name="name" required maxlength="80" value="${escapeHTML(student.name || "")}" placeholder="e.g. Jamie Morgan" /></div>
    <div class="form-grid"><div class="field"><label for="studentRoll">ROLL NUMBER</label><input id="studentRoll" name="roll" required maxlength="30" value="${escapeHTML(student.roll || "")}" placeholder="e.g. CS2024010" /></div><div class="field"><label for="studentSemester">SEMESTER</label><select id="studentSemester" name="semester" required>${Array.from({ length: 8 }, (_, index) => `<option value="${index + 1}" ${String(student.semester || "") === String(index + 1) ? "selected" : ""}>Semester ${index + 1}</option>`).join("")}</select></div></div>
    <div class="field"><label for="studentDepartment">DEPARTMENT</label><select id="studentDepartment" name="department" required>${departmentOptions}</select></div>
    <div class="field"><label for="studentEmail">EMAIL</label><input id="studentEmail" name="email" type="email" maxlength="120" value="${escapeHTML(student.email || "")}" placeholder="student@college.edu" /></div>
    <div class="modal-actions"><button type="button" class="button" data-action="close-modal">Cancel</button><button class="button button-primary" type="submit">${editing ? "Save changes" : "Add student"}</button></div></form>`);
}

function courseForm() {
  const departments = [...new Set([...data.students.map((student) => student.department), ...data.courses.map((course) => course.department), "Computer Science", "Business Administration", "Arts & Humanities", "Engineering"])].sort();
  const options = departments.map((department) => `<option value="${escapeHTML(department)}">${escapeHTML(department)}</option>`).join("");
  openModal("Add a course", "Set up a course and its student roster.", `<form class="modal-form" id="courseForm">
    <div class="form-grid"><div class="field"><label for="courseCode">COURSE CODE</label><input id="courseCode" name="code" required maxlength="20" placeholder="e.g. CS 208" /></div><div class="field"><label for="courseSemester">SEMESTER</label><select id="courseSemester" name="semester" required>${Array.from({ length: 8 }, (_, index) => `<option value="${index + 1}" ${index === 3 ? "selected" : ""}>Semester ${index + 1}</option>`).join("")}</select></div></div>
    <div class="field"><label for="courseName">COURSE NAME</label><input id="courseName" name="name" required maxlength="100" placeholder="e.g. Computer Networks" /></div>
    <div class="field"><label for="courseDepartment">DEPARTMENT</label><select id="courseDepartment" name="department" required>${options}</select></div>
    <div class="form-grid"><div class="field"><label for="courseInstructor">INSTRUCTOR</label><input id="courseInstructor" name="instructor" required maxlength="80" placeholder="e.g. Dr. Taylor" /></div><div class="field"><label for="courseTime">CLASS TIME</label><input id="courseTime" name="time" type="time" required value="09:00" /></div></div>
    <div class="modal-actions"><button type="button" class="button" data-action="close-modal">Cancel</button><button class="button button-primary" type="submit">Add course</button></div></form>`);
}

async function markStudent(studentId, status, rerender = true) {
  if (!["present", "absent"].includes(status)) return;
  const roster = getRoster(getCourse(selectedCourseId));
  if (!roster.some((student) => student.id === studentId)) return;
  const existing = getRecord(attendanceDate, selectedCourseId, studentId);
  if (!(await commitData(() => {
    if (existing) existing.status = status;
    else data.attendance.push({ date: attendanceDate, courseId: selectedCourseId, studentId, status });
  }))) return;
  if (rerender) render("attendance");
}

function exportCSV(records, filename) {
  const header = ["Date", "Course code", "Course", "Student", "Roll number", "Department", "Semester", "Status"];
  const lines = records.map((record) => {
    const student = data.students.find((item) => item.id === record.studentId);
    const course = getCourse(record.courseId);
    if (!student || !course) return null;
    return [record.date, course.code, course.name, student.name, student.roll, student.department, student.semester, record.status];
  }).filter(Boolean);
  const quote = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const csv = [header, ...lines].map((row) => row.map(quote).join(",")).join("\r\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
  showToast(`${lines.length} attendance record${lines.length === 1 ? "" : "s"} exported.`);
}

document.addEventListener("click", async (event) => {
  const nav = event.target.closest("[data-page]");
  if (nav) {
    render(nav.dataset.page);
    document.getElementById("sidebar").classList.remove("open");
    return;
  }
  const control = event.target.closest("[data-action]");
  if (!control) return;
  const { action, id, status } = control.dataset;
  if (action === "goto-attendance") render("attendance");
  if (action === "goto-reports") render("reports");
  if (action === "add-student") studentForm();
  if (action === "edit-student") {
    const student = data.students.find((item) => item.id === id);
    if (student) studentForm(student);
  }
  if (action === "add-course") courseForm();
  if (action === "close-modal") modal.close();
  if (action === "mark") await markStudent(control.dataset.student, status);
  if (action === "mark-all") {
    if (!["present", "absent"].includes(status)) return;
    const roster = getRoster(getCourse(selectedCourseId));
    if (await commitData(() => {
      roster.forEach((student) => {
        const record = getRecord(attendanceDate, selectedCourseId, student.id);
        if (record) record.status = status;
        else data.attendance.push({ date: attendanceDate, courseId: selectedCourseId, studentId: student.id, status });
      });
    })) {
      render("attendance");
      showToast(`All students marked ${status}.`);
    }
  }
  if (action === "save-attendance") {
    if (!getCourse(selectedCourseId)) return showToast("Add a course before saving attendance.");
    const roster = getRoster(getCourse(selectedCourseId));
    const missing = roster.filter((student) => !getRecord(attendanceDate, selectedCourseId, student.id)).length;
    if (missing) return showToast(`Mark attendance for all students first (${missing} remaining).`);
    if (await saveData()) {
      showToast("Attendance saved successfully.");
      render("attendance");
    }
  }
  if (action === "clear-session") {
    if (!confirm("Clear all attendance marks for this course and date?")) return;
    if (await commitData(() => {
      data.attendance = data.attendance.filter((item) => item.date !== attendanceDate || item.courseId !== selectedCourseId);
    })) {
      render("attendance");
      showToast("Attendance session cleared.");
    }
  }
  if (action === "delete-student") {
    const student = data.students.find((item) => item.id === id);
    if (!student || !confirm(`Delete ${student.name} and their attendance records?`)) return;
    if (await commitData(() => {
      data.students = data.students.filter((item) => item.id !== id);
      data.attendance = data.attendance.filter((item) => item.studentId !== id);
    })) {
      render("students");
      showToast("Student and related attendance records deleted.");
    }
  }
  if (action === "delete-course") {
    const course = getCourse(id);
    if (!course || !confirm(`Delete ${course.code} and its attendance records?`)) return;
    if (await commitData(() => {
      data.courses = data.courses.filter((item) => item.id !== id);
      data.attendance = data.attendance.filter((item) => item.courseId !== id);
    })) {
      if (selectedCourseId === id) selectedCourseId = data.courses[0]?.id || "";
      render("courses");
      showToast("Course and related attendance records deleted.");
    }
  }
  if (action === "export-report") {
    const filters = reportFilters;
    exportCSV(data.attendance.filter((item) => (!filters.date || item.date === filters.date) && (!filters.courseId || item.courseId === filters.courseId)), `attendance-report-${today()}.csv`);
  }
  if (action === "export-today") exportCSV(data.attendance.filter((item) => item.date === today()), `attendance-${today()}.csv`);
  if (action === "clear-report-filters") {
    reportFilters = { date: "", courseId: "" };
    render("reports");
  }
  if (action === "logout") {
    try {
      await apiRequest("/api/logout", {});
    } catch (error) {
      console.error("Could not sign out:", error);
    }
    renderAuth({ setupRequired: false });
  }
});

document.addEventListener("change", (event) => {
  if (event.target.id === "attendanceCourse") {
    selectedCourseId = event.target.value;
    render("attendance");
  }
  if (event.target.id === "attendanceDate") {
    attendanceDate = event.target.value || today();
    render("attendance");
  }
  if (event.target.id === "reportDate" || event.target.id === "reportCourse") {
    const filters = reportFilters;
    filters.date = document.getElementById("reportDate")?.value || "";
    filters.courseId = document.getElementById("reportCourse")?.value || "";
    reportFilters = filters;
    render("reports", { filters });
  }
});

document.addEventListener("input", (event) => {
  if (event.target.id === "studentSearch") {
    const position = event.target.selectionStart;
    render("students", { search: event.target.value });
    const input = document.getElementById("studentSearch");
    input.focus();
    input.setSelectionRange(position, position);
  }
});

document.addEventListener("submit", async (event) => {
  if (event.target.id === "authForm") {
    event.preventDefault();
    const formData = new FormData(event.target);
    const username = formData.get("username").trim();
    const password = formData.get("password");
    const setupRequired = Boolean(event.target.querySelector('[name="confirmPassword"]'));
    if (setupRequired && password !== formData.get("confirmPassword")) {
      renderAuth({ setupRequired: true, error: "Passwords do not match." });
      return;
    }
    try {
      await apiRequest(setupRequired ? "/api/setup" : "/api/login", { username, password });
      await loadServerData();
    } catch (error) {
      renderAuth({ setupRequired, error: error.message });
    }
    return;
  }
  if (event.target.id === "studentForm") {
    event.preventDefault();
    const formData = new FormData(event.target);
    const id = event.target.dataset.id;
    const student = { id: id || `s-${crypto.randomUUID()}`, name: formData.get("name").trim(), roll: formData.get("roll").trim(), department: formData.get("department"), semester: formData.get("semester"), email: formData.get("email").trim() };
    const duplicate = data.students.find((item) => item.roll.toLowerCase() === student.roll.toLowerCase() && item.id !== id);
    if (duplicate) return showToast("That roll number is already in use.");
    if (await commitData(() => {
      if (id) data.students[data.students.findIndex((item) => item.id === id)] = student;
      else data.students.push(student);
    })) {
      modal.close();
      render("students");
      showToast(id ? "Student details updated." : "Student added successfully.");
    }
  }
  if (event.target.id === "courseForm") {
    event.preventDefault();
    const formData = new FormData(event.target);
    const course = { id: `c-${crypto.randomUUID()}`, code: formData.get("code").trim(), name: formData.get("name").trim(), department: formData.get("department"), semester: formData.get("semester"), instructor: formData.get("instructor").trim(), time: new Date(`1970-01-01T${formData.get("time")}`).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) };
    if (data.courses.some((item) => item.code.toLowerCase() === course.code.toLowerCase())) return showToast("That course code is already in use.");
    if (await commitData(() => data.courses.push(course))) {
      selectedCourseId = course.id;
      modal.close();
      render("courses");
      showToast("Course added successfully.");
    }
  }
});

document.getElementById("mobileMenu").addEventListener("click", () => document.getElementById("sidebar").classList.toggle("open"));
document.getElementById("todayLabel").textContent = formatDate(today(), { weekday: "short", month: "short", day: "numeric" });
initializeApp();
