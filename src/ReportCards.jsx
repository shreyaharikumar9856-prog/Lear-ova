import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

function ReportCards() {
  const [students, setStudents] = useState([]);
  const [studentId, setStudentId] = useState("");
  const [period, setPeriod] = useState("monthly");

  const today = new Date();
  const firstDay = new Date(
    today.getFullYear(),
    today.getMonth(),
    1
  ).toISOString().slice(0, 10);

  const [startDate, setStartDate] = useState(firstDay);
  const [endDate, setEndDate] = useState(
    today.toISOString().slice(0, 10)
  );

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadStudents();
  }, []);

  async function loadStudents() {
    setStudentsLoading(true);
    setError("");

    try {
      const { data, error } = await supabase
        .from("students")
        .select("id, full_name, email")
        .order("full_name");

      if (error) throw error;

      setStudents(data || []);

      if (data?.length) {
        setStudentId(data[0].id);
      }
    } catch (err) {
      console.error("Student loading error:", err);
      setError(err.message);
    } finally {
      setStudentsLoading(false);
    }
  }

  function handlePeriodChange(value) {
    setPeriod(value);

    const now = new Date();

    if (value === "monthly") {
      setStartDate(
        new Date(now.getFullYear(), now.getMonth(), 1)
          .toISOString().slice(0, 10)
      );
      setEndDate(now.toISOString().slice(0, 10));
    } else {
      // Default term: current calendar quarter.
      const quarterStartMonth =
        Math.floor(now.getMonth() / 3) * 3;

      setStartDate(
        new Date(now.getFullYear(), quarterStartMonth, 1)
          .toISOString().slice(0, 10)
      );
      setEndDate(now.toISOString().slice(0, 10));
    }
  }

  async function generateReport() {
    if (!studentId || !startDate || !endDate) {
      setError("Please select a student and reporting period.");
      return;
    }

    if (startDate > endDate) {
      setError("Start date cannot be after end date.");
      return;
    }

    setLoading(true);
    setError("");
    setReport(null);

    try {
      const [
        studentResult,
        performanceResult,
        attendanceResult,
        assignmentsResult,
      ] = await Promise.all([
        supabase
          .from("students")
          .select("id, full_name, email")
          .eq("id", studentId)
          .single(),

        supabase
          .from("student_performance")
          .select("*")
          .eq("student_id", studentId)
          .gte("assessment_date", startDate)
          .lte("assessment_date", endDate)
          .order("assessment_date", { ascending: true }),

        supabase
          .from("attendance")
          .select("id, attendance_date, status, remarks")
          .eq("student_id", studentId)
          .gte("attendance_date", startDate)
          .lte("attendance_date", endDate)
          .order("attendance_date", { ascending: true }),

        supabase
          .from("assignments")
          .select("id, title, subject, assigned_at, due_date")
          .eq("student_id", studentId)
          .gte("assigned_at", `${startDate}T00:00:00`)
          .lte("assigned_at", `${endDate}T23:59:59`)
          .order("assigned_at", { ascending: true }),
      ]);

      if (studentResult.error) throw studentResult.error;
      if (performanceResult.error) throw performanceResult.error;
      if (attendanceResult.error) throw attendanceResult.error;
      if (assignmentsResult.error) throw assignmentsResult.error;

      const assignments = assignmentsResult.data || [];

      let submissions = [];

      if (assignments.length > 0) {
        const assignmentIds = assignments.map((item) => item.id);

        const { data, error } = await supabase
          .from("assignment_submissions")
          .select(
            "id, assignment_id, review_status, submitted_at"
          )
          .eq("student_id", studentId)
          .in("assignment_id", assignmentIds)
          .order("submitted_at", { ascending: false });

        if (error) throw error;

        submissions = data || [];
      }

      // Find the latest submission for each assignment.
      const latestSubmissions = new Map();

      submissions.forEach((submission) => {
        const existing = latestSubmissions.get(
          submission.assignment_id
        );

        if (
          !existing ||
          new Date(submission.submitted_at).getTime() >
            new Date(existing.submitted_at).getTime()
        ) {
          latestSubmissions.set(
            submission.assignment_id,
            submission
          );
        }
      });

      const homeworkRows = assignments.map((assignment) => {
        const submission = latestSubmissions.get(assignment.id);

        return {
          ...assignment,
          status: submission?.review_status || "Not Submitted",
        };
      });

      const performance = performanceResult.data || [];
      const attendance = attendanceResult.data || [];

      const tests = performance.filter(
        (item) => item.category === "Test"
      );

      const participation = performance.filter(
        (item) => item.category === "Participation"
      );

      const totalObtained = tests.reduce(
        (sum, item) => sum + Number(item.marks_obtained),
        0
      );

      const totalMaximum = tests.reduce(
        (sum, item) => sum + Number(item.max_marks),
        0
      );

      const testAverage = totalMaximum > 0
        ? (totalObtained / totalMaximum) * 100
        : null;

      const accepted = homeworkRows.filter(
        (item) => item.status === "Accepted"
      ).length;

      const awaiting = homeworkRows.filter(
        (item) => item.status === "Submitted"
      ).length;

      const recheck = homeworkRows.filter(
        (item) => item.status === "Recheck Required"
      ).length;

      const notSubmitted = homeworkRows.filter(
        (item) => item.status === "Not Submitted"
      ).length;

      const homeworkPercentage = homeworkRows.length
        ? (accepted / homeworkRows.length) * 100
        : null;

      const present = attendance.filter(
        (item) => item.status === "Present"
      ).length;

      const absent = attendance.filter(
        (item) => item.status === "Absent"
      ).length;

      const attendancePercentage = attendance.length
        ? (present / attendance.length) * 100
        : null;

      const participationObtained = participation.reduce(
        (sum, item) => sum + Number(item.marks_obtained),
        0
      );

      const participationMaximum = participation.reduce(
        (sum, item) => sum + Number(item.max_marks),
        0
      );

      const participationPercentage = participationMaximum > 0
        ? (participationObtained / participationMaximum) * 100
        : null;

      setReport({
        student: studentResult.data,
        performance,
        tests,
        participation,
        homeworkRows,
        attendance,
        testAverage,
        homeworkPercentage,
        participationPercentage,
        accepted,
        awaiting,
        recheck,
        notSubmitted,
        present,
        absent,
        attendancePercentage,
      });
    } catch (err) {
      console.error("Report generation error:", err);
      setError(err.message || "Unable to generate report.");
    } finally {
      setLoading(false);
    }
  }

  function percentage(value) {
    return value === null || value === undefined
      ? "N/A"
      : `${value.toFixed(1)}%`;
  }

  function formatDate(value) {
    if (!value) return "—";

    return new Date(`${value.slice(0, 10)}T00:00:00`)
      .toLocaleDateString();
  }

  function printReport() {
    window.print();
  }

  const styles = {
    container: {
      background: "#ffffff",
      padding: "24px",
      borderRadius: "16px",
      marginTop: "24px",
      color: "#1e293b",
      boxShadow: "0 4px 18px rgba(15,23,42,0.06)",
      width: "100%",
      boxSizing: "border-box",
    },
    heading: {
      fontSize: "24px",
      margin: "0 0 8px",
    },
    subtitle: {
      color: "#64748b",
      fontSize: "14px",
      margin: 0,
    },
    controls: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
      gap: "14px",
      marginTop: "24px",
      padding: "20px",
      background: "#f8fafc",
      borderRadius: "12px",
    },
    label: {
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      fontSize: "13px",
      fontWeight: 600,
    },
    input: {
      width: "100%",
      padding: "11px",
      border: "1px solid #cbd5e1",
      borderRadius: "8px",
      background: "#ffffff",
      boxSizing: "border-box",
    },
    button: {
      padding: "12px 18px",
      border: "none",
      borderRadius: "8px",
      background: "#2563eb",
      color: "#ffffff",
      fontWeight: 600,
      cursor: "pointer",
      marginTop: "12px",
    },
    secondaryButton: {
      padding: "11px 16px",
      border: "1px solid #cbd5e1",
      borderRadius: "8px",
      background: "#ffffff",
      cursor: "pointer",
      fontWeight: 600,
    },
    error: {
      background: "#fee2e2",
      color: "#991b1b",
      padding: "12px",
      borderRadius: "8px",
      marginTop: "16px",
    },
    report: {
      marginTop: "28px",
      border: "1px solid #e2e8f0",
      borderRadius: "12px",
      padding: "22px",
    },
    reportTitle: {
      textAlign: "center",
      paddingBottom: "18px",
      borderBottom: "2px solid #e2e8f0",
    },
    stats: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))",
      gap: "12px",
      margin: "22px 0",
    },
    stat: {
      background: "#f8fafc",
      border: "1px solid #e2e8f0",
      padding: "16px",
      borderRadius: "10px",
    },
    statLabel: {
      display: "block",
      color: "#64748b",
      fontSize: "12px",
      marginBottom: "8px",
    },
    statValue: {
      fontSize: "23px",
      fontWeight: 700,
    },
    sectionTitle: {
      fontSize: "17px",
      margin: "26px 0 12px",
    },
    tableWrapper: {
      width: "100%",
      overflowX: "auto",
    },
    table: {
      width: "100%",
      borderCollapse: "collapse",
      fontSize: "13px",
      textAlign: "left",
    },
    th: {
      padding: "11px",
      background: "#f1f5f9",
      borderBottom: "1px solid #cbd5e1",
      whiteSpace: "nowrap",
    },
    td: {
      padding: "11px",
      borderBottom: "1px solid #e2e8f0",
    },
    feedback: {
      padding: "14px",
      marginTop: "12px",
      background: "#f8fafc",
      borderRadius: "8px",
      whiteSpace: "pre-wrap",
    },
  };

  return (
    <section style={styles.container}>
      <h2 style={styles.heading}>Student Progress & Report Cards 📊</h2>

      <p style={styles.subtitle}>
        Generate academic progress reports for your students.
      </p>

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.controls}>
        <label style={styles.label}>
          Select Student
          <select
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            style={styles.input}
            disabled={studentsLoading}
          >
            <option value="">Choose student</option>
            {students.map((student) => (
              <option key={student.id} value={student.id}>
                {student.full_name}
              </option>
            ))}
          </select>
        </label>

        <label style={styles.label}>
          Report Type
          <select
            value={period}
            onChange={(e) => handlePeriodChange(e.target.value)}
            style={styles.input}
          >
            <option value="monthly">Monthly Report</option>
            <option value="term">Term Report</option>
          </select>
        </label>

        <label style={styles.label}>
          Start Date
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={styles.input}
          />
        </label>

        <label style={styles.label}>
          End Date
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={styles.input}
          />
        </label>
      </div>

      <button
        type="button"
        onClick={generateReport}
        disabled={loading || studentsLoading || !studentId}
        style={styles.button}
      >
        {loading ? "Generating..." : "Generate Report"}
      </button>

      {studentsLoading && <p>Loading students...</p>}

      {!studentsLoading && students.length === 0 && (
        <p>No student records found.</p>
      )}

      {report && (
        <div style={styles.report} id="learnova-report">
          <div style={styles.reportTitle}>
            <h1 style={{ margin: 0, letterSpacing: "2px" }}>
              LEARNOVA
            </h1>
            <h2>STUDENT PROGRESS REPORT</h2>
            <p>
              {period === "monthly" ? "Monthly Report" : "Term Report"}
            </p>
            <p>
              {formatDate(startDate)} – {formatDate(endDate)}
            </p>
          </div>

          <h3 style={styles.sectionTitle}>Student Information</h3>
          <p>
            <strong>Name:</strong> {report.student.full_name}
          </p>
          <p>
            <strong>Email:</strong> {report.student.email || "—"}
          </p>

          <h3 style={styles.sectionTitle}>Academic Summary</h3>

          <div style={styles.stats}>
            <div style={styles.stat}>
              <span style={styles.statLabel}>Test Average</span>
              <span style={styles.statValue}>
                {percentage(report.testAverage)}
              </span>
            </div>

            <div style={styles.stat}>
              <span style={styles.statLabel}>Homework Accepted</span>
              <span style={styles.statValue}>
                {report.accepted}/{report.homeworkRows.length}
              </span>
            </div>

            <div style={styles.stat}>
              <span style={styles.statLabel}>Homework Completion</span>
              <span style={styles.statValue}>
                {percentage(report.homeworkPercentage)}
              </span>
            </div>

            <div style={styles.stat}>
              <span style={styles.statLabel}>Class Participation</span>
              <span style={styles.statValue}>
                {percentage(report.participationPercentage)}
              </span>
            </div>

            <div style={styles.stat}>
              <span style={styles.statLabel}>Attendance</span>
              <span style={styles.statValue}>
                {percentage(report.attendancePercentage)}
              </span>
            </div>
          </div>

          <h3 style={styles.sectionTitle}>Test Performance</h3>

          {report.tests.length === 0 ? (
            <p>No test records for this period.</p>
          ) : (
            <div style={styles.tableWrapper}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Subject</th>
                    <th style={styles.th}>Assessment</th>
                    <th style={styles.th}>Marks</th>
                    <th style={styles.th}>Percentage</th>
                    <th style={styles.th}>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {report.tests.map((item) => (
                    <tr key={item.id}>
                      <td style={styles.td}>{item.subject}</td>
                      <td style={styles.td}>{item.title}</td>
                      <td style={styles.td}>
                        {item.marks_obtained}/{item.max_marks}
                      </td>
                      <td style={styles.td}>
                        {percentage(
                          Number(item.marks_obtained) /
                          Number(item.max_marks) * 100
                        )}
                      </td>
                      <td style={styles.td}>
                        {formatDate(item.assessment_date)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3 style={styles.sectionTitle}>Homework Performance</h3>

          <p>
            Accepted: {report.accepted} | Awaiting review: {report.awaiting}
            {" | "}Recheck required: {report.recheck}
            {" | "}Not submitted: {report.notSubmitted}
          </p>

          {report.homeworkRows.length > 0 && (
            <div style={styles.tableWrapper}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Homework</th>
                    <th style={styles.th}>Subject</th>
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}>Deadline</th>
                  </tr>
                </thead>
                <tbody>
                  {report.homeworkRows.map((item) => (
                    <tr key={item.id}>
                      <td style={styles.td}>{item.title}</td>
                      <td style={styles.td}>{item.subject || "—"}</td>
                      <td style={styles.td}>{item.status}</td>
                      <td style={styles.td}>
                        {formatDate(item.due_date)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3 style={styles.sectionTitle}>Class Participation</h3>

          {report.participation.length === 0 ? (
            <p>No participation records for this period.</p>
          ) : (
            <div style={styles.tableWrapper}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Subject</th>
                    <th style={styles.th}>Activity</th>
                    <th style={styles.th}>Marks</th>
                    <th style={styles.th}>Teacher Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {report.participation.map((item) => (
                    <tr key={item.id}>
                      <td style={styles.td}>{item.subject}</td>
                      <td style={styles.td}>{item.title}</td>
                      <td style={styles.td}>
                        {item.marks_obtained}/{item.max_marks}
                      </td>
                      <td style={styles.td}>{item.remarks || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3 style={styles.sectionTitle}>Attendance Summary</h3>

          <p>
            Total recorded classes: {report.attendance.length}
          </p>
          <p>
            Present: {report.present} | Absent: {report.absent}
          </p>

          {report.attendance.length > 0 && (
            <div style={styles.tableWrapper}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Date</th>
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {report.attendance.map((item) => (
                    <tr key={item.id}>
                      <td style={styles.td}>
                        {formatDate(item.attendance_date)}
                      </td>
                      <td style={styles.td}>{item.status}</td>
                      <td style={styles.td}>{item.remarks || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3 style={styles.sectionTitle}>Teacher Feedback</h3>

          {report.performance.some((item) => item.remarks) ? (
            report.performance
              .filter((item) => item.remarks)
              .map((item) => (
                <div key={item.id} style={styles.feedback}>
                  <strong>
                    {item.subject} — {item.title}
                  </strong>
                  <p>{item.remarks}</p>
                </div>
              ))
          ) : (
            <p>No teacher feedback recorded for this period.</p>
          )}

          <div style={{ marginTop: "30px", textAlign: "center" }}>
            <p>Thank you for being a part of Learnova!</p>
            <p>Teacher's Signature: __________________</p>
          </div>

          <button
            type="button"
            onClick={printReport}
            style={styles.button}
          >
            Print / Save Report as PDF
          </button>
        </div>
      )}
    </section>
  );
}

export default ReportCards;