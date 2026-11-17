import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import HomeworkManagement from "./HomeworkManagement";
import TeacherSubmissionReview from "./TeacherSubmissionReview";
import HomeworkReports from "./HomeworkReports";
import PerformanceManagement from "./PerformanceManagement";
import ReportCards from "./ReportCards";
import Timetable from "./Timetable";
import Announcements from "./Announcements";
import CoinManagement from "./CoinManagement";
import LeagueManagement from "./LeagueManagement";
import TeacherSubjectManagement from "./TeacherSubjectManagement";
import SubjectNotesManagement from "./SubjectNotesManagement";
import TestMaker from "./TestMaker";
import "./TeacherDashboard.css";

function getLocalDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCurrentMonth() {
  return getLocalDate().slice(0, 7);
}

const teacherMenu = [
  { id: "Overview", icon: "🏠", label: "Overview" },
  { id: "Students", icon: "👩‍🎓", label: "Students" },
  { id: "Attendance", icon: "📅", label: "Attendance" },
  { id: "Attendance Reports", icon: "📊", label: "Attendance Reports" },
  { id: "Homework", icon: "📝", label: "Homework" },
  { id: "Submissions", icon: "✅", label: "Submission Review" },
  { id: "Homework Reports", icon: "📈", label: "Homework Reports" },
  { id: "Performance", icon: "🎯", label: "Performance" },
  { id: "Report Cards", icon: "🗂️", label: "Report Cards" },
  { id: "Timetable", icon: "🗓️", label: "Timetable" },
  { id: "Announcements", icon: "📢", label: "Announcements" },
  { id: "Coin Management", icon: "🪙", label: "Coin Management" },
  { id: "League Management", icon: "🏆", label: "League Management" },
  { id: "Subject Management", icon: "📚", label: "Subject Management" },
  { id: "Subject Notes", icon: "📖", label: "Subject Notes" },
  { id: "Test Maker", icon: "📝", label: "Test Maker" },
];

const sectionDescriptions = {
  Overview: "Your teaching space at a glance.",
  Students: "View your registered learners.",
  Attendance: "Record daily attendance for your students.",
  "Attendance Reports": "Review attendance totals and monthly history.",
  Homework: "Create and manage student homework.",
  Submissions: "Review work submitted by your students.",
  "Homework Reports": "Track homework completion and submission activity.",
  Performance: "Monitor student learning and performance.",
  "Report Cards": "Prepare and review student report cards.",
  Timetable: "Manage class schedules and meeting details.",
  Announcements: "Share updates with all students or selected learners.",
  "Coin Management": "Manage student coins and rewards.",
  "League Management": "Manage monthly student leagues.",
  "Subject Management": "Assign subjects to individual students.",
  "Subject Notes": "Upload and manage subject-wise learning materials.",
  "Test Maker": "Create customised tests and examinations for your students.",
};

function TeacherDashboard({ onLogout }) {
  const [activeSection, setActiveSection] = useState(() => {
  try {
    return localStorage.getItem("learnova_teacher_active_section") || "Overview";
  } catch {
    return "Overview";
  }
});
  useEffect(() => {
  try {
    localStorage.setItem("learnova_teacher_active_section", activeSection);
  } catch (error) {
    console.error("Unable to save teacher section:", error);
  }
}, [activeSection]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newStudentName, setNewStudentName] = useState("");
  const [newStudentPassword, setNewStudentPassword] = useState("");
  const [creatingStudent, setCreatingStudent] = useState(false);
  const [createStudentMessage, setCreateStudentMessage] = useState("");

  const [attendanceDate, setAttendanceDate] = useState(getLocalDate());
  const [attendance, setAttendance] = useState({});
  const [saving, setSaving] = useState(false);
  const [attendanceMessage, setAttendanceMessage] = useState("");

  const [reportMonth, setReportMonth] = useState(getCurrentMonth());
  const [reportRecords, setReportRecords] = useState([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState("");

  // Load registered students.
  useEffect(() => {
    let cancelled = false;

    async function fetchStudents() {
      setLoading(true);
      setError("");

      const { data, error: fetchError } = await supabase
        .from("students")
        .select("id, full_name, email, created_at")
        .order("created_at", { ascending: false });

      if (cancelled) return;

      if (fetchError) {
        setError(fetchError.message);
      } else {
        setStudents(data || []);
      }

      setLoading(false);
    }

    fetchStudents();

    return () => {
      cancelled = true;
    };
  }, []);

  // Load attendance for the selected date.
  useEffect(() => {
    let cancelled = false;

    async function fetchAttendance() {
      setAttendanceMessage("");

      const { data, error: fetchError } = await supabase
        .from("attendance")
        .select("student_id, status, remarks")
        .eq("attendance_date", attendanceDate);

      if (cancelled) return;

      if (fetchError) {
        setAttendanceMessage(`Unable to load attendance: ${fetchError.message}`);
        setAttendance({});
        return;
      }

      const records = {};
      (data || []).forEach((record) => {
        records[record.student_id] = {
          status: record.status,
          remarks: record.remarks || "",
        };
      });

      setAttendance(records);
    }

    if (attendanceDate) fetchAttendance();

    return () => {
      cancelled = true;
    };
  }, [attendanceDate]);

  // Load attendance records for the selected month.
  useEffect(() => {
    let cancelled = false;

    async function fetchMonthlyReport() {
      if (!reportMonth) return;

      setReportLoading(true);
      setReportError("");

      const startDate = `${reportMonth}-01`;
      const [year, month] = reportMonth.split("-").map(Number);
      const nextMonthDate = new Date(year, month, 1);
      const endDateExclusive = [
        nextMonthDate.getFullYear(),
        String(nextMonthDate.getMonth() + 1).padStart(2, "0"),
        "01",
      ].join("-");

      const { data, error: fetchError } = await supabase
        .from("attendance")
        .select("id, student_id, attendance_date, status, remarks")
        .gte("attendance_date", startDate)
        .lt("attendance_date", endDateExclusive)
        .order("attendance_date", { ascending: true });

      if (cancelled) return;

      if (fetchError) {
        setReportError(fetchError.message);
        setReportRecords([]);
      } else {
        setReportRecords(data || []);
      }

      setReportLoading(false);
    }

    fetchMonthlyReport();

    return () => {
      cancelled = true;
    };
  }, [reportMonth]);

  function updateAttendance(studentId, field, value) {
    setAttendance((previous) => ({
      ...previous,
      [studentId]: {
        status: previous[studentId]?.status || "",
        remarks: previous[studentId]?.remarks || "",
        [field]: value,
      },
    }));
  }
  async function handleCreateStudent(e) {
  e.preventDefault();

  setCreatingStudent(true);
  setCreateStudentMessage("");

  try {
    const { data, error } = await supabase.functions.invoke(
      "create-student",
      {
        body: {
          full_name: newStudentName.trim(),
          password: newStudentPassword,
        },
      }
    );

    if (error) {
      let errorMessage = error.message;

      if (error.context) {
        try {
          const details = await error.context.clone().json();
          errorMessage = details.error || errorMessage;
        } catch {
          // Keep the original error message.
        }
      }

      throw new Error(errorMessage);
    }

    if (!data?.success) {
      throw new Error(data?.error || "Unable to create student.");
    }

    setCreateStudentMessage(
      `Success! Student ID: ${data.student_id}`
    );

    setNewStudentName("");
    setNewStudentPassword("");

    const { data: refreshedStudents, error: refreshError } =
      await supabase
        .from("students")
        .select("id, full_name, email, created_at")
        .order("created_at", { ascending: false });

    if (!refreshError) {
      setStudents(refreshedStudents || []);
    }

  } catch (error) {
    setCreateStudentMessage(
      error.message || "Something went wrong."
    );
  } finally {
    setCreatingStudent(false);
  }
}

  function getNextMonthStart(monthString) {
    const [year, month] = monthString.split("-").map(Number);
    const nextMonth = new Date(year, month, 1);

    return [
      nextMonth.getFullYear(),
      String(nextMonth.getMonth() + 1).padStart(2, "0"),
      "01",
    ].join("-");
  }

  async function saveAttendance() {
    setSaving(true);
    setAttendanceMessage("");

    if (!students.length) {
      setAttendanceMessage("There are no students to mark attendance for.");
      setSaving(false);
      return;
    }

    const unmarkedStudents = students.filter(
      (student) => !attendance[student.id]?.status
    );

    if (unmarkedStudents.length > 0) {
      setAttendanceMessage(
        `Please mark all students. ${unmarkedStudents.length} still need a status.`
      );
      setSaving(false);
      return;
    }

    const records = students.map((student) => ({
      student_id: student.id,
      attendance_date: attendanceDate,
      status: attendance[student.id].status,
      remarks: attendance[student.id].remarks.trim() || null,
    }));

    const { error: saveError } = await supabase
      .from("attendance")
      .upsert(records, {
        onConflict: "student_id,attendance_date",
      });

    if (saveError) {
      setAttendanceMessage(`Unable to save attendance: ${saveError.message}`);
      setSaving(false);
      return;
    }

    setAttendanceMessage("Attendance saved successfully! ✅");

    if (attendanceDate.slice(0, 7) === reportMonth) {
      const { data, error: reportFetchError } = await supabase
        .from("attendance")
        .select("id, student_id, attendance_date, status, remarks")
        .gte("attendance_date", `${reportMonth}-01`)
        .lt("attendance_date", getNextMonthStart(reportMonth))
        .order("attendance_date", { ascending: true });

      if (!reportFetchError && data) {
        setReportRecords(data);
      }
    }

    setSaving(false);
  }

  function getStudentStats(studentId, records = reportRecords) {
    const studentRecords = records.filter(
      (record) => record.student_id === studentId
    );

    const present = studentRecords.filter(
      (record) => record.status === "Present"
    ).length;

    const absent = studentRecords.filter(
      (record) => record.status === "Absent"
    ).length;

    const total = present + absent;

    return {
      present,
      absent,
      total,
      percentage: total ? Math.round((present / total) * 100) : null,
    };
  }

  const presentCount = students.filter(
    (student) => attendance[student.id]?.status === "Present"
  ).length;

  const absentCount = students.filter(
    (student) => attendance[student.id]?.status === "Absent"
  ).length;

  const totalPresent = reportRecords.filter(
    (record) => record.status === "Present"
  ).length;

  const totalAbsent = reportRecords.filter(
    (record) => record.status === "Absent"
  ).length;

  const totalRecorded = totalPresent + totalAbsent;
  const overallPercentage = totalRecorded
    ? Math.round((totalPresent / totalRecorded) * 100)
    : null;

  const sortedDailyRecords = [...reportRecords].sort((a, b) => {
    const dateComparison = b.attendance_date.localeCompare(a.attendance_date);
    if (dateComparison !== 0) return dateComparison;

    const nameA = students.find((student) => student.id === a.student_id)?.full_name || "";
    const nameB = students.find((student) => student.id === b.student_id)?.full_name || "";
    return nameA.localeCompare(nameB);
  });

  const activeMenuItem = teacherMenu.find((item) => item.id === activeSection);

    function renderStudentsTable() {
    if (loading) return <p className="teacher-state">Loading students...</p>;
    if (error) return <p className="teacher-error">Unable to load students: {error}</p>;
    if (students.length === 0) return <p className="teacher-state">No students found yet.</p>;

    return (
      <div className="teacher-table-wrap">
        <table className="teacher-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Registered On</th>
            </tr>
          </thead>
          <tbody>
            {students.map((student) => (
              <tr key={student.id}>
                <td>{student.full_name}</td>
                <td>{student.email || "Not provided"}</td>
                <td>
                  {student.created_at
                    ? new Date(student.created_at).toLocaleDateString()
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function renderStudentsSection() {
    return (
      <section className="teacher-panel">
        <div className="teacher-panel-heading">
          <div>
            <h2>👩‍🎓 Registered Students</h2>
            <p>All learners registered in Learnova.</p>
          </div>
          <span className="teacher-count-pill">{students.length} students</span>
        </div>

        <form
          onSubmit={handleCreateStudent}
          style={{
            padding: "20px",
            margin: "20px 0",
            background: "#faf7ff",
            borderRadius: "12px",
          }}
        >
          <h3>➕ Register New Student</h3>

          <label>
            Student Full Name
            <input
              type="text"
              value={newStudentName}
              onChange={(e) => setNewStudentName(e.target.value)}
              placeholder="Enter student name"
              required
              style={{ display: "block", width: "100%", padding: "12px", margin: "8px 0" }}
            />
          </label>

          <label>
            Temporary Password
            <input
              type="password"
              value={newStudentPassword}
              onChange={(e) => setNewStudentPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              minLength={8}
              required
              style={{ display: "block", width: "100%", padding: "12px", margin: "8px 0" }}
            />
          </label>

          <button
            type="submit"
            className="teacher-primary-button"
            disabled={creatingStudent}
          >
            {creatingStudent ? "Creating Account..." : "Create Student Account"}
          </button>

          {createStudentMessage && (
            <p role="status" style={{ marginTop: "12px" }}>
              {createStudentMessage}
            </p>
          )}
        </form>

        {renderStudentsTable()}
      </section>
    );
  }

  function renderAttendanceSection() {
    return (
      <section className="teacher-panel attendance-section">
        <div className="teacher-panel-heading">
          <div>
            <h2>📅 Attendance Management</h2>
            <p>Mark and save daily student attendance.</p>
          </div>
        </div>

        <div className="teacher-control-row">
          <label htmlFor="attendance-date">
            <strong>Select date</strong>
            <input
              id="attendance-date"
              type="date"
              value={attendanceDate}
              onChange={(event) => setAttendanceDate(event.target.value)}
            />
          </label>
        </div>

        <div className="attendance-summary teacher-attendance-summary">
          <span>🟢 Present: {presentCount}</span>
          <span>🔴 Absent: {absentCount}</span>
          <span>⚪ Unmarked: {students.length - presentCount - absentCount}</span>
        </div>

        {!loading && !error && students.length > 0 && (
          <div className="teacher-table-wrap">
            <table className="teacher-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Status</th>
                  <th>Remarks (Optional)</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr key={student.id}>
                    <td>{student.full_name}</td>
                    <td>
                      <select
                        aria-label={`Attendance for ${student.full_name}`}
                        value={attendance[student.id]?.status || ""}
                        onChange={(event) =>
                          updateAttendance(student.id, "status", event.target.value)
                        }
                      >
                        <option value="">Select status</option>
                        <option value="Present">Present</option>
                        <option value="Absent">Absent</option>
                      </select>
                    </td>
                    <td>
                      <input
                        type="text"
                        placeholder="Optional remark"
                        value={attendance[student.id]?.remarks || ""}
                        onChange={(event) =>
                          updateAttendance(student.id, "remarks", event.target.value)
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {loading && <p className="teacher-state">Loading students...</p>}
        {error && <p className="teacher-error">{error}</p>}
        {!loading && students.length === 0 && !error && (
          <p className="teacher-state">No students available to mark.</p>
        )}

        <button
          type="button"
          className="teacher-primary-button"
          onClick={saveAttendance}
          disabled={saving || loading || !!error || students.length === 0}
        >
          {saving ? "Saving..." : "Save Attendance"}
        </button>

        {attendanceMessage && (
          <p className="teacher-status-message" role="status">
            {attendanceMessage}
          </p>
        )}
      </section>
    );
  }

  function renderAttendanceReports() {
    return (
      <section className="teacher-panel attendance-reports">
        <div className="teacher-panel-heading">
          <div>
            <h2>📊 Attendance Reports</h2>
            <p>Attendance percentages are based only on dates with recorded attendance.</p>
          </div>
        </div>

        <div className="teacher-control-row">
          <label htmlFor="report-month">
            <strong>Select month</strong>
            <input
              id="report-month"
              type="month"
              value={reportMonth}
              onChange={(event) => setReportMonth(event.target.value)}
            />
          </label>
        </div>

        {reportLoading && <p className="teacher-state">Loading attendance report...</p>}
        {reportError && <p className="teacher-error" role="alert">Unable to load report: {reportError}</p>}

        {!reportLoading && !reportError && (
          <>
            <h3 className="teacher-subheading">Monthly Overview</h3>
            <div className="attendance-summary teacher-attendance-summary">
              <span>🟢 Present: {totalPresent}</span>
              <span>🔴 Absent: {totalAbsent}</span>
              <span>📚 Recorded: {totalRecorded}</span>
              <span>📈 Overall: {overallPercentage === null ? "No records" : `${overallPercentage}%`}</span>
            </div>

            <div className="teacher-table-wrap">
              <table className="teacher-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Present</th>
                    <th>Absent</th>
                    <th>Recorded Classes</th>
                    <th>Attendance %</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((student) => {
                    const stats = getStudentStats(student.id);
                    return (
                      <tr key={student.id}>
                        <td>{student.full_name}</td>
                        <td>{stats.present}</td>
                        <td>{stats.absent}</td>
                        <td>{stats.total}</td>
                        <td>{stats.percentage === null ? "No records" : `${stats.percentage}%`}</td>
                      </tr>
                    );
                  })}
                  {students.length === 0 && (
                    <tr><td colSpan="5">No students available.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <h3 className="teacher-subheading teacher-history-heading">Daily Attendance History</h3>
            {sortedDailyRecords.length === 0 ? (
              <p className="teacher-state">No attendance records for this month yet.</p>
            ) : (
              <div className="teacher-table-wrap">
                <table className="teacher-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Student</th>
                      <th>Status</th>
                      <th>Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedDailyRecords.map((record) => {
                      const student = students.find((item) => item.id === record.student_id);
                      return (
                        <tr key={record.id}>
                          <td>{record.attendance_date}</td>
                          <td>{student?.full_name || "Unknown student"}</td>
                          <td>{record.status}</td>
                          <td>{record.remarks || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
    );
  }

  function renderOverview() {
    return (
      <>
        <section className="teacher-overview-stats">
          <article className="teacher-overview-stat teacher-stat-lilac">
            <span>👩‍🎓</span>
            <div>
              <p>Total Students</p>
              <strong>{loading ? "—" : students.length}</strong>
            </div>
          </article>
          <article className="teacher-overview-stat teacher-stat-mint">
            <span>🟢</span>
            <div>
              <p>Present Today</p>
              <strong>{loading ? "—" : presentCount}</strong>
            </div>
          </article>
          <article className="teacher-overview-stat teacher-stat-peach">
            <span>🔴</span>
            <div>
              <p>Absent Today</p>
              <strong>{loading ? "—" : absentCount}</strong>
            </div>
          </article>
          <article className="teacher-overview-stat teacher-stat-blue">
            <span>⚪</span>
            <div>
              <p>Not Marked</p>
              <strong>{loading ? "—" : Math.max(0, students.length - presentCount - absentCount)}</strong>
            </div>
          </article>
        </section>

        {renderStudentsSection()}

        <section className="teacher-panel teacher-quick-actions">
          <div className="teacher-panel-heading">
            <div>
              <h2>✨ Quick Actions</h2>
              <p>Jump directly to the tools you use most.</p>
            </div>
          </div>
          <div className="teacher-quick-action-grid">
            {[
              ["Attendance", "📅", "Mark attendance"],
              ["Homework", "📝", "Create homework"],
              ["Announcements", "📢", "Publish an announcement"],
              ["Subject Management", "📚", "Assign subjects"],
            ].map(([id, icon, label]) => (
              <button
                type="button"
                className="teacher-quick-action"
                key={id}
                onClick={() => setActiveSection(id)}
              >
                <span>{icon}</span>
                {label}
                <b>→</b>
              </button>
            ))}
          </div>
        </section>
      </>
    );
  }

  function renderActiveSection() {
    switch (activeSection) {
      case "Overview":
        return renderOverview();
      case "Students":
        return renderStudentsSection();
      case "Attendance":
        return renderAttendanceSection();
      case "Attendance Reports":
        return renderAttendanceReports();
      case "Homework":
        return <HomeworkManagement />;
      case "Submissions":
        return <TeacherSubmissionReview />;
      case "Homework Reports":
        return <HomeworkReports />;
      case "Performance":
        return <PerformanceManagement />;
      case "Report Cards":
        return <ReportCards />;
      case "Timetable":
        return <Timetable />;
      case "Announcements":
        return <Announcements />;
      case "Coin Management":
        return <CoinManagement />;
      case "League Management":
        return <LeagueManagement />;
      case "Subject Management":
        return <TeacherSubjectManagement />;
      case "Subject Notes":
        return <SubjectNotesManagement />;
      case "Test Maker":
        return <TestMaker />;
      default: 
        return renderOverview();
    }
  }

  return (
    <div className="teacher-app-shell">
      <aside className="teacher-sidebar">
        <div className="teacher-brand">
          <div className="teacher-brand-icon">🌷</div>
          <div>
            <h2>Learñova</h2>
            <p>Teacher Workspace</p>
          </div>
        </div>

        <div className="teacher-sidebar-profile">
          <div className="teacher-profile-avatar">👩‍🏫</div>
          <div>
            <strong>Teacher Dashboard</strong>
            <span>Manage • Teach • Inspire</span>
          </div>
        </div>

        <p className="teacher-menu-label">TEACHING TOOLS</p>
        <nav className="teacher-navigation" aria-label="Teacher dashboard navigation">
          {teacherMenu.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`teacher-nav-item ${activeSection === item.id ? "active" : ""}`}
              onClick={() => setActiveSection(item.id)}
              aria-current={activeSection === item.id ? "page" : undefined}
            >
              <span className="teacher-nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="teacher-sidebar-footer">
          <span>🌱</span>
          <strong>Little steps, big impact.</strong>
          <p>Thank you for helping learners grow!</p>
        </div>
                <button
          type="button"
          className="teacher-nav-item"
          onClick={onLogout}
          style={{ marginTop: "12px", color: "#d9534f" }}
        >
          <span className="teacher-nav-icon">🚪</span>
          <span>Log Out</span>
        </button>
      </aside>

      <main className="teacher-main-content">
        <header className="teacher-topbar">
          <div>
            <p className="teacher-eyebrow">LEARÑOVA • TEACHER SPACE</p>
            <h1>{activeMenuItem?.icon} {activeMenuItem?.label || "Teacher Dashboard"}</h1>
            <p>{sectionDescriptions[activeSection] || "Manage your students and their learning."}</p>
          </div>
          <div className="teacher-topbar-badge">🎓 Teacher</div>
        </header>

        <div className="teacher-content-area">
          {renderActiveSection()}
        </div>

        <footer className="teacher-footer">
          Made with 💗 for curious minds <span>•</span> Learñova © 2026
        </footer>
      </main>
    </div>
  );
}

export default TeacherDashboard;
