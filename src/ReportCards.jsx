import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import "./ReportCards.css";

function ReportCards() {
  const [students, setStudents] = useState([]);
  const [studentId, setStudentId] = useState("");
  const [period, setPeriod] = useState("monthly");

  const today = new Date();
  const toLocalDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const firstDay = toLocalDate(
    new Date(today.getFullYear(), today.getMonth(), 1)
  );

  const [startDate, setStartDate] = useState(firstDay);
  const [endDate, setEndDate] = useState(toLocalDate(today));

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [error, setError] = useState("");

  const [teacherFeedback, setTeacherFeedback] = useState("");
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState("");

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
    setReport(null);
    setTeacherFeedback("");
    setFeedbackMessage("");

    try {
      const [
        studentResult,
        performanceResult,
        attendanceResult,
        assignmentsResult,
        coinResult,
        feedbackResult,
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
          .lte("assigned_at", `${endDate}T23:59:59.999`)
          .order("assigned_at", { ascending: true }),

        supabase
          .from("coin_transactions")
          .select("*")
          .eq("student_id", studentId)
          .gte("created_at", `${startDate}T00:00:00`)
          .lte("created_at", `${endDate}T23:59:59.999`)
          .order("created_at", { ascending: false }),

        supabase
          .from("report_feedback")
          .select("feedback")
          .eq("student_id", studentId)
          .eq("start_date", startDate)
          .eq("end_date", endDate)
          .maybeSingle(),
      ]);

      if (studentResult.error) throw studentResult.error;
      if (performanceResult.error) throw performanceResult.error;
      if (attendanceResult.error) throw attendanceResult.error;
      if (assignmentsResult.error) throw assignmentsResult.error;
      if (coinResult.error) throw coinResult.error;
      if (feedbackResult.error) throw feedbackResult.error;

      const assignments = assignmentsResult.data || [];
      let submissions = [];

      if (assignments.length > 0) {
        const assignmentIds = assignments.map((item) => item.id);

        const { data, error } = await supabase
          .from("assignment_submissions")
          .select("id, assignment_id, review_status, submitted_at")
          .eq("student_id", studentId)
          .in("assignment_id", assignmentIds)
          .order("submitted_at", { ascending: false });

        if (error) throw error;

        submissions = data || [];
      }

      const latestSubmissions = new Map();

      submissions.forEach((submission) => {
        const existing = latestSubmissions.get(submission.assignment_id);

        if (
          !existing ||
          new Date(submission.submitted_at).getTime() >
            new Date(existing.submitted_at).getTime()
        ) {
          latestSubmissions.set(submission.assignment_id, submission);
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
      const coinTransactions = coinResult.data || [];

      const tests = performance.filter(
        (item) => item.category === "Test"
      );

      const participation = performance.filter(
        (item) => item.category === "Participation"
      );

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

      const recordedAttendance = present + absent;

      const attendancePercentage = recordedAttendance > 0
        ? (present / recordedAttendance) * 100
        : null;

      const participationObtained = participation.reduce(
        (sum, item) => sum + (Number(item.marks_obtained) || 0),
        0
      );

      const participationMaximum = participation.reduce(
        (sum, item) => sum + (Number(item.max_marks) || 0),
        0
      );

      const participationPercentage = participationMaximum > 0
        ? (participationObtained / participationMaximum) * 100
        : null;

      const earnedCoins = coinTransactions
        .filter((item) => item.transaction_type === "Earned")
        .reduce((sum, item) => sum + Number(item.coins || 0), 0);

      const deductedCoins = coinTransactions
        .filter((item) => item.transaction_type === "Deducted")
        .reduce((sum, item) => sum + Number(item.coins || 0), 0);

      setTeacherFeedback(feedbackResult.data?.feedback || "");

      setReport({
        student: studentResult.data,
        performance,
        tests,
        participation,
        homeworkRows,
        attendance,
        coinTransactions,
        testAverage,
        totalObtained,
        totalMaximum,
        homeworkPercentage,
        participationPercentage,
        accepted,
        awaiting,
        recheck,
        notSubmitted,
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

  async function saveFeedback() {
    if (!report) return;

    setFeedbackLoading(true);
    setFeedbackMessage("");

    try {
      const { error } = await supabase
        .from("report_feedback")
        .upsert(
          {
            student_id: studentId,
            start_date: startDate,
            end_date: endDate,
            feedback: teacherFeedback.trim(),
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "student_id,start_date,end_date",
          }
        );

      if (error) throw error;

      setFeedbackMessage("Feedback saved successfully!");
    } catch (err) {
      console.error("Feedback saving error:", err);
      setFeedbackMessage(`Unable to save feedback: ${err.message}`);
    } finally {
      setFeedbackLoading(false);
    }
  }

  function percentage(value) {
    return value === null || value === undefined
      ? "N/A"
      : `${value.toFixed(1)}%`;
  }

  function formatDate(value) {
    if (!value) return "—";

    const datePart = value.slice(0, 10);
    const [year, month, day] = datePart.split("-");

    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day)
    ).toLocaleDateString();
  }

  function formatDateTime(value) {
    if (!value) return "—";
    return new Date(value).toLocaleString();
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
        Student Progress & Report Cards 📊
      </h2>

      <p className="report-subtitle">
        Generate academic progress reports for your students.
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
          <div className="report-title">
            <h1>LEARNOVA</h1>
            <h2>STUDENT PROGRESS REPORT</h2>
            <p>
              {period === "monthly" ? "Monthly Report" : "Term Report"}
            </p>
            <p>
              {formatDate(startDate)} – {formatDate(endDate)}
            </p>
          </div>

          <h3 className="report-section-title">Student Information</h3>
          <p><strong>Name:</strong> {report.student.full_name}</p>
          <p><strong>Email:</strong> {report.student.email || "—"}</p>

          <h3 className="report-section-title">Academic Summary</h3>

          <div className="report-stats">
            <div className="report-stat">
              <span>Test Average</span>
              <strong>{percentage(report.testAverage)}</strong>
            </div>

            <div className="report-stat">
              <span>Homework Accepted</span>
              <strong>
                {report.accepted}/{report.homeworkRows.length}
              </strong>
            </div>

            <div className="report-stat">
              <span>Homework Completion</span>
              <strong>{percentage(report.homeworkPercentage)}</strong>
            </div>

            <div className="report-stat">
              <span>Class Participation</span>
              <strong>{percentage(report.participationPercentage)}</strong>
            </div>

            <div className="report-stat">
              <span>Attendance</span>
              <strong>{percentage(report.attendancePercentage)}</strong>
            </div>
          </div>

          <h3 className="report-section-title">Overall Test Performance</h3>

          <div className="report-highlight">
            <strong>
              Overall Score: {report.totalObtained} / {report.totalMaximum}
            </strong>
            <span>{percentage(report.testAverage)}</span>
          </div>

          {report.tests.length === 0 ? (
            <p>No test records for this period.</p>
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

          <h3 className="report-section-title">Homework Performance</h3>

          <p>
            Accepted: {report.accepted} | Awaiting review: {report.awaiting}
            {" | "}Recheck required: {report.recheck}
            {" | "}Not submitted: {report.notSubmitted}
          </p>

          {report.homeworkRows.length > 0 && (
            <div className="report-table-wrapper">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Homework</th>
                    <th>Subject</th>
                    <th>Status</th>
                    <th>Deadline</th>
                  </tr>
                </thead>
                <tbody>
                  {report.homeworkRows.map((item) => (
                    <tr key={item.id}>
                      <td>{item.title}</td>
                      <td>{item.subject || "—"}</td>
                      <td>{item.status}</td>
                      <td>{formatDate(item.due_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3 className="report-section-title">Class Participation</h3>

          {report.participation.length === 0 ? (
            <p>No participation records for this period.</p>
          ) : (
            <div className="report-table-wrapper">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Subject</th>
                    <th>Activity</th>
                    <th>Marks</th>
                    <th>Teacher Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {report.participation.map((item) => (
                    <tr key={item.id}>
                      <td>{item.subject || "—"}</td>
                      <td>{item.title || "—"}</td>
                      <td>{item.marks_obtained}/{item.max_marks}</td>
                      <td>{item.remarks || "—"}</td>
                    </tr>
                  ))}
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
                      #3b82f6 0deg ${presentAngle}deg,
                      #ef4444 ${presentAngle}deg 360deg
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
                Present: <strong>{report.present}</strong>
                {attendanceTotal > 0
                  ? ` (${percentage(report.present / attendanceTotal * 100)})`
                  : ""}
              </p>

              <p>
                <span className="legend-dot absent-dot" />
                Absent: <strong>{report.absent}</strong>
                {attendanceTotal > 0
                  ? ` (${percentage(report.absent / attendanceTotal * 100)})`
                  : ""}
              </p>

              <p>Total recorded classes: {report.attendance.length}</p>
              <p>Counted classes: {report.recordedAttendance}</p>
            </div>
          </div>

          {report.attendance.length > 0 ? (
            <div className="report-table-wrapper">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {report.attendance.map((item) => (
                    <tr key={item.id}>
                      <td>{formatDate(item.attendance_date)}</td>
                      <td>{item.status}</td>
                      <td>{item.remarks || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>No attendance records for this period.</p>
          )}

          <h3 className="report-section-title">Learnova Coin History 🪙</h3>

          <div className="coin-summary">
            <div>
              <span>Coins Earned</span>
              <strong className="coin-earned">+{report.earnedCoins}</strong>
            </div>

            <div>
              <span>Coins Deducted</span>
              <strong className="coin-deducted">-{report.deductedCoins}</strong>
            </div>

            <div>
              <span>Net Coins</span>
              <strong>{report.netCoins}</strong>
            </div>
          </div>

          {report.coinTransactions.length === 0 ? (
            <p>No coin transactions for this reporting period.</p>
          ) : (
            <div className="report-table-wrapper">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Activity</th>
                    <th>Reason</th>
                    <th>Transaction</th>
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
                        {item.coins} coins
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3 className="report-section-title">Teacher's Feedback Corner 💬</h3>

          <div className="teacher-feedback-box">
            <p>
              Share your observations about the student's progress,
              strengths and areas for improvement.
            </p>

            <textarea
              value={teacherFeedback}
              onChange={(e) => setTeacherFeedback(e.target.value)}
              placeholder="Write your feedback here..."
              rows={6}
              maxLength={3000}
            />

            <div className="feedback-actions">
              <span>{teacherFeedback.length}/3000 characters</span>

              <button
                type="button"
                className="report-button"
                onClick={saveFeedback}
                disabled={feedbackLoading}
              >
                {feedbackLoading ? "Saving..." : "Save Feedback"}
              </button>
            </div>

            {feedbackMessage && (
              <p className="feedback-message">{feedbackMessage}</p>
            )}
          </div>

          <div className="report-signature">
            <p>Thank you for being a part of Learnova!</p>
            <p>Teacher's Signature: __________________</p>
          </div>

          <button
            type="button"
            className="report-button print-button"
            onClick={printReport}
          >
            Print / Save Report as PDF
          </button>
        </div>
      )}
    </section>
  );
}

export default ReportCards;
