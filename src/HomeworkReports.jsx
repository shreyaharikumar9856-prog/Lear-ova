import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

function HomeworkReports() {
const [assignments, setAssignments] = useState([]);
const [submissions, setSubmissions] = useState([]);
const [students, setStudents] = useState([]);
const [loading, setLoading] = useState(true);
const [errorMessage, setErrorMessage] = useState("");
const [filter, setFilter] = useState("All");

async function loadReports() {
setLoading(true);
setErrorMessage("");

try {
  const [
    assignmentsResult,
    submissionsResult,
    studentsResult,
  ] = await Promise.all([
    supabase
      .from("assignments")
      .select("id, student_id, title, subject, due_date, assigned_at")
      .order("assigned_at", { ascending: false }),

    supabase
      .from("assignment_submissions")
      .select(
        "id, assignment_id, student_id, review_status, submitted_at"
      )
      .order("submitted_at", { ascending: false }),

    supabase
      .from("students")
      .select("id, full_name, email"),
  ]);

  // Log Supabase errors before processing the results.
  console.log("ASSIGNMENTS QUERY:", assignmentsResult);
  console.log("SUBMISSIONS QUERY:", submissionsResult);
  console.log("STUDENTS QUERY:", studentsResult);

  if (assignmentsResult.error) throw assignmentsResult.error;
  if (submissionsResult.error) throw submissionsResult.error;
  if (studentsResult.error) throw studentsResult.error;

  const assignmentData = assignmentsResult.data || [];
  const submissionData = submissionsResult.data || [];
  const studentData = studentsResult.data || [];

  // Diagnostic logs to inspect the returned records.
  console.log("REPORT ASSIGNMENTS:", assignmentData);
  console.log("REPORT SUBMISSIONS:", submissionData);
  console.log("REPORT STUDENTS:", studentData);

  setAssignments(assignmentData);
  setSubmissions(submissionData);
  setStudents(studentData);
} catch (error) {
  console.error("Unable to load homework reports:", error);
  setErrorMessage(
    error.message || "Unable to load homework reports."
  );
} finally {
  setLoading(false);
}

}

useEffect(() => {
loadReports();
}, []);

// Match student IDs to student records.
const studentMap = new Map(
students.map((student) => [
String(student.id),
student,
])
);

// Find the newest submission for each assignment/student pair.
const latestSubmissionMap = new Map();

submissions.forEach((submission) => {
const key = "${submission.assignment_id}_${submission.student_id}";
const existing = latestSubmissionMap.get(key);

const submittedTime = submission.submitted_at
  ? new Date(submission.submitted_at).getTime()
  : 0;

const existingTime = existing?.submitted_at
  ? new Date(existing.submitted_at).getTime()
  : 0;

if (!existing || submittedTime > existingTime) {
  latestSubmissionMap.set(key, submission);
}

});

// Create one report row for every assigned homework record.
const reportRows = assignments.map((assignment) => {

  // Find submissions belonging to this exact assignment and student.
  const matchingSubmissions = submissions.filter(
    (submission) =>
      String(submission.assignment_id).trim() ===
        String(assignment.id).trim() &&
      String(submission.student_id).trim() ===
        String(assignment.student_id).trim()
  );

  // Select the newest submission.
  const submission = matchingSubmissions.reduce(
    (latest, current) => {
      if (!latest) return current;

      return new Date(current.submitted_at).getTime() >
        new Date(latest.submitted_at).getTime()
        ? current
        : latest;
    },
    null
  );

  const student = studentMap.get(String(assignment.student_id));

  const status = submission
    ? submission.review_status
    : "Not Submitted";

  return {
    ...assignment,
    studentName: student?.full_name || "Unknown student",
    studentEmail: student?.email || "",
    status,
    submittedAt: submission?.submitted_at || null,
  };
});

console.table(
  reportRows.map((row) => ({
    homework: row.title,
    student: row.studentName,
    status: row.status,
  }))
);

// Summary statistics use the latest submission status.
const counts = {
total: reportRows.length,

accepted: reportRows.filter(
  (item) => item.status === "Accepted"
).length,

awaiting: reportRows.filter(
  (item) => item.status === "Submitted"
).length,

recheck: reportRows.filter(
  (item) => item.status === "Recheck Required"
).length,

notSubmitted: reportRows.filter(
  (item) => item.status === "Not Submitted"
).length,

};

const completionPercentage = counts.total
? Math.round((counts.accepted / counts.total) * 100)
: 0;

const filteredRows =
filter === "All"
? reportRows
: reportRows.filter((item) => item.status === filter);

function formatDate(dateString) {
if (!dateString) return "—";

return new Date(dateString).toLocaleDateString();

}

const statCards = [
{
label: "Total Assigned",
value: counts.total,
color: "#475569",
},
{
label: "Accepted",
value: counts.accepted,
color: "#15803d",
},
{
label: "Awaiting Review",
value: counts.awaiting,
color: "#b45309",
},
{
label: "Recheck Required",
value: counts.recheck,
color: "#7c3aed",
},
{
label: "Not Submitted",
value: counts.notSubmitted,
color: "#dc2626",
},
];

const statusColors = {
Accepted: {
background: "#dcfce7",
color: "#166534",
},
Submitted: {
background: "#fef3c7",
color: "#92400e",
},
"Recheck Required": {
background: "#ede9fe",
color: "#5b21b6",
},
"Not Submitted": {
background: "#fee2e2",
color: "#991b1b",
},
};

return (
<section style={styles.panel}>
<div style={styles.header}>
<div>
<h2 style={styles.heading}>
Homework Completion Reports
</h2>

      <p style={styles.subtitle}>
        Track assignments, submissions, and student progress.
      </p>
    </div>

    <button
      type="button"
      onClick={loadReports}
      disabled={loading}
      style={styles.refreshButton}
    >
      ↻ Refresh
    </button>
  </div>

  {errorMessage && (
    <div style={styles.error}>
      <strong>Unable to load reports:</strong>{" "}
      {errorMessage}
    </div>
  )}

  {loading ? (
    <p>Loading homework reports...</p>
  ) : (
    <>
      <div style={styles.statsGrid}>
        {statCards.map((card) => (
          <div key={card.label} style={styles.statCard}>
            <span style={styles.statLabel}>
              {card.label}
            </span>

            <strong
              style={{
                ...styles.statValue,
                color: card.color,
              }}
            >
              {card.value}
            </strong>
          </div>
        ))}
      </div>

      <div style={styles.progressSection}>
        <div style={styles.progressHeader}>
          <strong>Overall Completion</strong>
          <strong>{completionPercentage}%</strong>
        </div>

        <div style={styles.progressTrack}>
          <div
            style={{
              ...styles.progressFill,
              width: `${completionPercentage}%`,
            }}
          />
        </div>

        <p style={styles.progressNote}>
          {counts.accepted} of {counts.total} assignments
          accepted. Only accepted homework counts as completed.
        </p>
      </div>

      <div style={styles.tableHeader}>
        <h3 style={styles.subheading}>
          Assignment Details
        </h3>

        <select
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          style={styles.select}
          aria-label="Filter homework by status"
        >
          <option value="All">All statuses</option>
          <option value="Accepted">Accepted</option>
          <option value="Submitted">Awaiting review</option>
          <option value="Recheck Required">
            Recheck required
          </option>
          <option value="Not Submitted">
            Not submitted
          </option>
        </select>
      </div>

      {filteredRows.length === 0 ? (
        <div style={styles.empty}>
          <h3>No assignments found</h3>
          <p>
            Assign homework to students to see reports here.
          </p>
        </div>
      ) : (
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Student</th>
                <th style={styles.th}>Homework</th>
                <th style={styles.th}>Subject</th>
                <th style={styles.th}>Deadline</th>
                <th style={styles.th}>Status</th>
              </tr>
            </thead>

            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.id}>
                  <td style={styles.td}>
                    <strong>{row.studentName}</strong>

                    {row.studentEmail && (
                      <div style={styles.email}>
                        {row.studentEmail}
                      </div>
                    )}
                  </td>

                  <td style={styles.td}>
                    {row.title}
                  </td>

                  <td style={styles.td}>
                    {row.subject || "—"}
                  </td>

                  <td style={styles.td}>
                    {formatDate(row.due_date)}
                  </td>

                  <td style={styles.td}>
                    <span
                      style={{
                        ...styles.badge,
                        ...(statusColors[row.status] || {
                          background: "#f1f5f9",
                          color: "#334155",
                        }),
                      }}
                    >
                      {row.status === "Submitted"
                        ? "Awaiting Review"
                        : row.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )}
</section>

);
}

const styles = {
panel: {
background: "#ffffff",
padding: "24px",
borderRadius: "16px",
marginTop: "24px",
boxShadow: "0 4px 18px rgba(15, 23, 42, 0.06)",
color: "#1e293b",
width: "100%",
boxSizing: "border-box",
},

header: {
display: "flex",
justifyContent: "space-between",
alignItems: "center",
gap: "12px",
flexWrap: "wrap",
marginBottom: "24px",
},

heading: {
fontSize: "23px",
margin: "0 0 8px",
},

subtitle: {
color: "#64748b",
margin: 0,
fontSize: "14px",
},

refreshButton: {
border: "1px solid #cbd5e1",
borderRadius: "8px",
padding: "10px 14px",
background: "#ffffff",
cursor: "pointer",
fontWeight: 600,
},

statsGrid: {
display: "grid",
gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))",
gap: "14px",
},

statCard: {
border: "1px solid #e2e8f0",
borderRadius: "12px",
padding: "18px",
display: "flex",
flexDirection: "column",
gap: "12px",
},

statLabel: {
color: "#64748b",
fontSize: "13px",
},

statValue: {
fontSize: "30px",
},

progressSection: {
marginTop: "26px",
padding: "20px",
background: "#f8fafc",
borderRadius: "12px",
},

progressHeader: {
display: "flex",
justifyContent: "space-between",
marginBottom: "12px",
},

progressTrack: {
height: "10px",
background: "#e2e8f0",
borderRadius: "20px",
overflow: "hidden",
},

progressFill: {
height: "100%",
background: "#16a34a",
borderRadius: "20px",
transition: "width 0.3s ease",
},

progressNote: {
color: "#64748b",
fontSize: "13px",
marginBottom: 0,
},

tableHeader: {
display: "flex",
justifyContent: "space-between",
alignItems: "center",
gap: "12px",
flexWrap: "wrap",
margin: "28px 0 16px",
},

subheading: {
margin: 0,
fontSize: "18px",
},

select: {
padding: "10px",
border: "1px solid #cbd5e1",
borderRadius: "8px",
background: "#ffffff",
maxWidth: "100%",
},

tableWrapper: {
width: "100%",
overflowX: "auto",
},

table: {
width: "100%",
borderCollapse: "collapse",
textAlign: "left",
fontSize: "14px",
},

th: {
padding: "13px 12px",
borderBottom: "2px solid #e2e8f0",
color: "#475569",
whiteSpace: "nowrap",
},

td: {
padding: "14px 12px",
borderBottom: "1px solid #e2e8f0",
verticalAlign: "top",
},

email: {
color: "#64748b",
fontSize: "12px",
marginTop: "4px",
},

badge: {
display: "inline-block",
padding: "6px 9px",
borderRadius: "20px",
fontSize: "12px",
fontWeight: 600,
whiteSpace: "nowrap",
},

empty: {
textAlign: "center",
padding: "32px 16px",
background: "#f8fafc",
borderRadius: "12px",
},

error: {
padding: "12px",
marginBottom: "16px",
borderRadius: "8px",
background: "#fee2e2",
color: "#991b1b",
overflowWrap: "anywhere",
},
};

export default HomeworkReports;