import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import "./ReportCards.css";

function ReportCards() {
  const [students, setStudents] = useState([]);
  const [studentId, setStudentId] = useState("");
  const [period, setPeriod] = useState("monthly");

  const toLocalDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const today = new Date();
  const [startDate, setStartDate] = useState(
    toLocalDate(new Date(today.getFullYear(), today.getMonth(), 1))
  );
  const [endDate, setEndDate] = useState(toLocalDate(today));

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [error, setError] = useState("");

  const [grade, setGrade] = useState("");
  const [homeworkNotes, setHomeworkNotes] = useState("");
  const [teacherFeedback, setTeacherFeedback] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    loadStudents();
  }, []);

  async function loadStudents() {
    setStudentsLoading(true);
    setError("");

    try {
      const { data, error } = await supabase
        .from("students")
        .select("id, full_name")
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
        toLocalDate(new Date(now.getFullYear(), now.getMonth(), 1))
      );
    } else {
      const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
      setStartDate(
        toLocalDate(
          new Date(now.getFullYear(), quarterStartMonth, 1)
        )
      );
    }

    setEndDate(toLocalDate(now));
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
    setSaveMessage("");
    setReport(null);
    setGrade("");
    setHomeworkNotes("");
    setTeacherFeedback("");

    try {
      const [
        studentResult,
        performanceResult,
        attendanceResult,
        coinResult,
        feedbackResult,
      ] = await Promise.all([
        supabase
          .from("students")
          .select("id, full_name")
          .eq("id", studentId)
          .single(),

        supabase
          .from("student_performance")
          .select("*")
          .eq("student_id", studentId)
          .eq("category", "Test")
          .gte("assessment_date", startDate)
          .lte("assessment_date", endDate)
          .order("assessment_date", { ascending: true }),

        supabase
          .from("attendance")
          .select("id, attendance_date, status")
          .eq("student_id", studentId)
          .gte("attendance_date", startDate)
          .lte("attendance_date", endDate)
          .order("attendance_date", { ascending: true }),

        supabase
          .from("coin_transactions")
          .select("*")
          .eq("student_id", studentId)
          .gte("created_at", `${startDate}T00:00:00`)
          .lte("created_at", `${endDate}T23:59:59.999`)
          .order("created_at", { ascending: false }),

        supabase
          .from("report_feedback")
          .select("grade, homework_notes, feedback")
          .eq("student_id", studentId)
          .eq("start_date", startDate)
          .eq("end_date", endDate)
          .maybeSingle(),
      ]);

      if (studentResult.error) throw studentResult.error;
      if (performanceResult.error) throw performanceResult.error;
      if (attendanceResult.error) throw attendanceResult.error;
      if (coinResult.error) throw coinResult.error;
      if (feedbackResult.error) throw feedbackResult.error;

      const tests = performanceResult.data || [];
      const attendance = attendanceResult.data || [];
      const coinTransactions = coinResult.data || [];

      const totalObtained = tests.reduce(
        (sum, item) => sum + (Number(item.marks_obtained) || 0),
        0
      );

      const totalMaximum = tests.reduce(
        (sum, item) => sum + (Number(item.max_marks) || 0),
        0
      );

      const testAverage = totalMaximum > 0
        ? (totalObtained / totalMaximum) * 100
        : null;

      const present = attendance.filter(
        (item) => item.status === "Present"
      ).length;

      const absent = attendance.filter(
        (item) => item.status === "Absent"
      ).length;

      const recordedAttendance = present + absent;

      const attendancePercentage = recordedAttendance > 0
        ? (present / recordedAttendance) * 100
        : null;

      const earnedCoins = coinTransactions
        .filter((item) => item.transaction_type === "Earned")
        .reduce((sum, item) => sum + Number(item.coins || 0), 0);

      const deductedCoins = coinTransactions
        .filter((item) => item.transaction_type === "Deducted")
        .reduce((sum, item) => sum + Number(item.coins || 0), 0);

      const savedDetails = feedbackResult.data;

      setGrade(savedDetails?.grade || "");
      setHomeworkNotes(savedDetails?.homework_notes || "");
      setTeacherFeedback(savedDetails?.feedback || "");

      setReport({
        student: studentResult.data,
        tests,
        attendance,
        coinTransactions,
        totalObtained,
        totalMaximum,
        testAverage,
        present,
        absent,
        recordedAttendance,
        attendancePercentage,
        earnedCoins,
        deductedCoins,
        netCoins: earnedCoins - deductedCoins,
      });
    } catch (err) {
      console.error("Report generation error:", err);
      setError(err.message || "Unable to generate report.");
    } finally {
      setLoading(false);
    }
  }

  async function saveReportNotes() {
    if (!report) return;

    setSaving(true);
    setSaveMessage("");

    try {
      const { error } = await supabase
        .from("report_feedback")
        .upsert(
          {
            student_id: studentId,
            start_date: startDate,
            end_date: endDate,
            grade: grade.trim(),
            homework_notes: homeworkNotes.trim(),
            feedback: teacherFeedback.trim(),
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "student_id,start_date,end_date",
          }
        );

      if (error) throw error;

      setSaveMessage("Report details saved successfully.");
    } catch (err) {
      console.error("Report saving error:", err);
      setSaveMessage(`Unable to save: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  function percentage(value) {
    return value === null || value === undefined
      ? "N/A"
      : `${value.toFixed(1)}%`;
  }

  function formatDate(value) {
    if (!value) return "—";

    const [year, month, day] = value.slice(0, 10).split("-");

    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day)
    ).toLocaleDateString();
  }

  function formatDateTime(value) {
    return value ? new Date(value).toLocaleString() : "—";
  }

  function printReport() {
    window.print();
  }

  const attendanceTotal = report?.recordedAttendance || 0;
  const presentAngle = attendanceTotal > 0
    ? (report.present / attendanceTotal) * 360
    : 0;

  return (
    <section className="report-container">
      <h2 className="report-heading">
        Student Progress & Report Cards
      </h2>

      <p className="report-subtitle">
        Create and print professional student progress reports.
      </p>

      {error && <div className="report-error">{error}</div>}

      <div className="report-controls">
        <label>
          Select Student
          <select
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
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

        <label>
          Report Type
          <select
            value={period}
            onChange={(e) => handlePeriodChange(e.target.value)}
          >
            <option value="monthly">Monthly Report</option>
            <option value="term">Term Report</option>
          </select>
        </label>

        <label>
          Start Date
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </label>

        <label>
          End Date
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </label>
      </div>

      <button
        type="button"
        className="report-button"
        onClick={generateReport}
        disabled={loading || studentsLoading || !studentId}
      >
        {loading ? "Generating..." : "Generate Report"}
      </button>

      {studentsLoading && <p>Loading students...</p>}

      {!studentsLoading && students.length === 0 && (
        <p>No student records found.</p>
      )}

      {report && (
        <div className="report-paper" id="learnova-report">
          <header className="report-title">
            <h1>LEARNOVA ONLINE SESSIONS</h1>
            <div className="report-title-rule" />
            <h2>STUDENT PROGRESS REPORT</h2>
            <p>
              {period === "monthly" ? "Monthly Report" : "Term Report"}
            </p>
            <p className="report-period">
              {formatDate(startDate)} – {formatDate(endDate)}
            </p>
          </header>

          <section className="report-student-details">
            <div className="student-name">
              <span>STUDENT NAME</span>
              <strong>{report.student.full_name}</strong>
            </div>

            <label className="grade-field">
              <span>GRADE / CLASS</span>
              <input
                type="text"
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                placeholder="Enter grade"
                maxLength={40}
              />
            </label>
          </section>

          <h3 className="report-section-title">Academic Overview</h3>

          <div className="report-stats">
            <div className="report-stat">
              <span>Overall Test Score</span>
              <strong>{percentage(report.testAverage)}</strong>
            </div>

            <div className="report-stat">
              <span>Tests Recorded</span>
              <strong>{report.tests.length}</strong>
            </div>

            <div className="report-stat">
              <span>Attendance</span>
              <strong>{percentage(report.attendancePercentage)}</strong>
            </div>
          </div>

          <h3 className="report-section-title">Overall Test Performance</h3>

          <div className="report-highlight">
            <span>Overall Marks</span>
            <strong>
              {report.totalObtained} / {report.totalMaximum}
            </strong>
            <strong>{percentage(report.testAverage)}</strong>
          </div>

          {report.tests.length === 0 ? (
            <p className="report-empty">
              No test records available for this reporting period.
            </p>
          ) : (
            <div className="report-table-wrapper">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Subject</th>
                    <th>Assessment</th>
                    <th>Marks</th>
                    <th>Percentage</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {report.tests.map((item) => {
                    const max = Number(item.max_marks);
                    const obtained = Number(item.marks_obtained);

                    return (
                      <tr key={item.id}>
                        <td>{item.subject || "—"}</td>
                        <td>{item.title || "—"}</td>
                        <td>{obtained}/{max}</td>
                        <td>
                          {max > 0
                            ? percentage((obtained / max) * 100)
                            : "N/A"}
                        </td>
                        <td>{formatDate(item.assessment_date)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <h3 className="report-section-title">Attendance Overview</h3>

          <div className="attendance-layout">
            <div
              className="attendance-pie"
              style={{
                background: attendanceTotal > 0
                  ? `conic-gradient(
                      #3978c5 0deg ${presentAngle}deg,
                      #df6262 ${presentAngle}deg 360deg
                    )`
                  : "#e5e7eb",
              }}
            >
              <div className="attendance-pie-inner">
                <strong>{percentage(report.attendancePercentage)}</strong>
                <span>Present</span>
              </div>
            </div>

            <div className="attendance-legend">
              <p>
                <span className="legend-dot present-dot" />
                Present
                <strong>{report.present}</strong>
              </p>

              <p>
                <span className="legend-dot absent-dot" />
                Absent
                <strong>{report.absent}</strong>
              </p>

              <p className="attendance-total">
                Total Classes
                <strong>{report.recordedAttendance}</strong>
              </p>
            </div>
          </div>

          <h3 className="report-section-title">Homework Notes</h3>

          <div className="editable-report-box">
            <p className="editable-hint">
              Teacher's homework observations and comments
            </p>
            <textarea
              value={homeworkNotes}
              onChange={(e) => setHomeworkNotes(e.target.value)}
              placeholder="Write about homework completion, consistency, areas that need attention, or improvements..."
              rows={5}
            />
          </div>

          <h3 className="report-section-title">Learnova Coin History</h3>

          <div className="coin-summary">
            <div>
              <span>Coins Earned</span>
              <strong className="coin-earned">
                +{report.earnedCoins}
              </strong>
            </div>

            <div>
              <span>Coins Deducted</span>
              <strong className="coin-deducted">
                -{report.deductedCoins}
              </strong>
            </div>

            <div>
              <span>Net Coins</span>
              <strong>{report.netCoins}</strong>
            </div>
          </div>

          {report.coinTransactions.length === 0 ? (
            <p className="report-empty">
              No coin transactions recorded during this period.
            </p>
          ) : (
            <div className="report-table-wrapper">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Activity</th>
                    <th>Reason</th>
                    <th>Coins</th>
                  </tr>
                </thead>
                <tbody>
                  {report.coinTransactions.map((item) => (
                    <tr key={item.id}>
                      <td>{formatDateTime(item.created_at)}</td>
                      <td>{item.activity || "—"}</td>
                      <td>{item.reason || "—"}</td>
                      <td
                        className={
                          item.transaction_type === "Earned"
                            ? "coin-earned"
                            : "coin-deducted"
                        }
                      >
                        {item.transaction_type === "Earned" ? "+" : "-"}
                        {item.coins}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3 className="report-section-title">Teacher's Feedback</h3>

          <div className="editable-report-box feedback-box">
            <p className="editable-hint">
              Personal feedback on the student's progress, strengths
              and areas for improvement
            </p>
            <textarea
              value={teacherFeedback}
              onChange={(e) => setTeacherFeedback(e.target.value)}
              placeholder="Write your feedback about the student here..."
              rows={6}
              maxLength={3000}
            />
            <span className="character-count">
              {teacherFeedback.length}/3000 characters
            </span>
          </div>

          <footer className="report-footer">
            <p>Thank you for being a part of Learnova!</p>
            <div className="signature-line">
              <span>Teacher's Signature</span>
              <span>________________________</span>
            </div>
          </footer>

          <div className="report-actions">
            <button
              type="button"
              className="report-button"
              onClick={saveReportNotes}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save Report Details"}
            </button>

            <button
              type="button"
              className="report-button print-button"
              onClick={printReport}
            >
              Print / Save as PDF
            </button>
          </div>

          {saveMessage && (
            <p className="save-message">{saveMessage}</p>
          )}
        </div>
      )}
    </section>
  );
}

export default ReportCards;
