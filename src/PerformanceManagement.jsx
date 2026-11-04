import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

function PerformanceManagement() {
const [students, setStudents] = useState([]);
const [records, setRecords] = useState([]);
const [loading, setLoading] = useState(true);
const [saving, setSaving] = useState(false);
const [message, setMessage] = useState("");
const [error, setError] = useState("");

const [form, setForm] = useState({
student_id: "",
category: "Test",
subject: "",
title: "",
marks_obtained: "",
max_marks: "100",
remarks: "",
assessment_date: new Date().toISOString().slice(0, 10),
});

useEffect(() => {
loadData();
}, []);

async function loadData() {
setLoading(true);
setError("");


try {
  const [studentsResult, recordsResult] = await Promise.all([
    supabase
      .from("students")
      .select("id, full_name, email")
      .order("full_name"),

    supabase
      .from("student_performance")
      .select(`
        id,
        student_id,
        category,
        subject,
        title,
        marks_obtained,
        max_marks,
        remarks,
        assessment_date,
        students (
          full_name
        )
      `)
      .order("assessment_date", { ascending: false }),
  ]);

  if (studentsResult.error) throw studentsResult.error;
  if (recordsResult.error) throw recordsResult.error;

  setStudents(studentsResult.data || []);
  setRecords(recordsResult.data || []);
} catch (err) {
  console.error("Performance loading error:", err);
  setError(err.message || "Unable to load performance records.");
} finally {
  setLoading(false);
}


}

function handleChange(event) {
const { name, value } = event.target;


setForm((previous) => ({
  ...previous,
  [name]: value,
}));

setMessage("");
setError("");


}

const percentage =
form.marks_obtained !== "" &&
Number(form.max_marks) > 0
? (
(Number(form.marks_obtained) /
Number(form.max_marks)) *
100
).toFixed(1)
: null;

async function handleSubmit(event) {
event.preventDefault();


setMessage("");
setError("");

if (!form.student_id) {
  setError("Please select a student.");
  return;
}

if (!form.subject.trim() || !form.title.trim()) {
  setError("Please enter the subject and assessment name.");
  return;
}

const obtained = Number(form.marks_obtained);
const maximum = Number(form.max_marks);

if (
  !Number.isFinite(obtained) ||
  !Number.isFinite(maximum) ||
  maximum <= 0 ||
  obtained < 0 ||
  obtained > maximum
) {
  setError("Please enter valid marks. Obtained marks cannot exceed maximum marks.");
  return;
}

setSaving(true);

try {
  const { error: insertError } = await supabase
    .from("student_performance")
    .insert({
      student_id: form.student_id,
      category: form.category,
      subject: form.subject.trim(),
      title: form.title.trim(),
      marks_obtained: obtained,
      max_marks: maximum,
      remarks: form.remarks.trim() || null,
      assessment_date: form.assessment_date,
    });

  if (insertError) throw insertError;

  setMessage("Performance record saved successfully! ✓");

  setForm((previous) => ({
    ...previous,
    title: "",
    marks_obtained: "",
    remarks: "",
  }));

  await loadData();
} catch (err) {
  console.error("Performance saving error:", err);
  setError(err.message || "Unable to save performance record.");
} finally {
  setSaving(false);
}


}

const [selectedStudent, setSelectedStudent] = useState("All");

const filteredRecords =
selectedStudent === "All"
? records
: records.filter(
(record) => record.student_id === selectedStudent
);

return ( <section style={styles.container}> <div style={styles.header}> <div> <h2 style={styles.heading}>Student Performance 📊</h2> <p style={styles.subtitle}>
Record and monitor student academic performance. </p> </div>


    <button
      type="button"
      style={styles.refreshButton}
      onClick={loadData}
      disabled={loading}
    >
      ↻ Refresh
    </button>
  </div>

  {error && <div style={styles.error}>{error}</div>}
  {message && <div style={styles.success}>{message}</div>}

  <div style={styles.formCard}>
    <h3 style={styles.sectionTitle}>Add Performance Record</h3>

    {loading ? (
      <p>Loading students...</p>
    ) : (
      <form onSubmit={handleSubmit}>
        <div style={styles.formGrid}>
          <label style={styles.label}>
            Select Student
            <select
              name="student_id"
              value={form.student_id}
              onChange={handleChange}
              style={styles.input}
              required
            >
              <option value="">Choose a student</option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.full_name}
                </option>
              ))}
            </select>
          </label>

          <label style={styles.label}>
            Assessment Category
            <select
              name="category"
              value={form.category}
              onChange={handleChange}
              style={styles.input}
            >
              <option value="Test">Test</option>
              <option value="Participation">Class Participation</option>
            </select>
          </label>

          <label style={styles.label}>
            Subject
            <input
              name="subject"
              value={form.subject}
              onChange={handleChange}
              placeholder="e.g. Mathematics"
              style={styles.input}
              required
            />
          </label>

          <label style={styles.label}>
            Assessment Name
            <input
              name="title"
              value={form.title}
              onChange={handleChange}
              placeholder="e.g. Chapter 3 Test"
              style={styles.input}
              required
            />
          </label>

          <label style={styles.label}>
            Marks Obtained
            <input
              type="number"
              name="marks_obtained"
              value={form.marks_obtained}
              onChange={handleChange}
              min="0"
              step="0.01"
              placeholder="e.g. 18"
              style={styles.input}
              required
            />
          </label>

          <label style={styles.label}>
            Maximum Marks
            <input
              type="number"
              name="max_marks"
              value={form.max_marks}
              onChange={handleChange}
              min="0.01"
              step="0.01"
              style={styles.input}
              required
            />
          </label>

          <label style={styles.label}>
            Assessment Date
            <input
              type="date"
              name="assessment_date"
              value={form.assessment_date}
              onChange={handleChange}
              style={styles.input}
              required
            />
          </label>

          <label style={styles.label}>
            Percentage
            <div style={styles.percentageBox}>
              {percentage !== null ? `${percentage}%` : "Enter marks"}
            </div>
          </label>
        </div>

        <label style={styles.label}>
          Teacher Remarks
          <textarea
            name="remarks"
            value={form.remarks}
            onChange={handleChange}
            placeholder="Add feedback about the student's performance..."
            rows={3}
            style={styles.textarea}
          />
        </label>

        <button
          type="submit"
          disabled={saving || loading || students.length === 0}
          style={styles.saveButton}
        >
          {saving ? "Saving..." : "Save Performance"}
        </button>
      </form>
    )}
  </div>

  <div style={styles.recordsCard}>
    <div style={styles.recordsHeader}>
      <h3 style={styles.sectionTitle}>Performance Records</h3>

      <select
        value={selectedStudent}
        onChange={(event) => setSelectedStudent(event.target.value)}
        style={styles.filter}
      >
        <option value="All">All Students</option>
        {students.map((student) => (
          <option key={student.id} value={student.id}>
            {student.full_name}
          </option>
        ))}
      </select>
    </div>

    {loading ? (
      <p>Loading records...</p>
    ) : filteredRecords.length === 0 ? (
      <div style={styles.empty}>
        No performance records available yet.
      </div>
    ) : (
      <div style={styles.tableWrapper}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Student</th>
              <th style={styles.th}>Category</th>
              <th style={styles.th}>Subject</th>
              <th style={styles.th}>Assessment</th>
              <th style={styles.th}>Marks</th>
              <th style={styles.th}>Percentage</th>
              <th style={styles.th}>Date</th>
            </tr>
          </thead>

          <tbody>
            {filteredRecords.map((record) => {
              const percentageValue =
                (Number(record.marks_obtained) /
                  Number(record.max_marks)) *
                100;

              return (
                <tr key={record.id}>
                  <td style={styles.td}>
                    {record.students?.full_name || "Unknown"}
                  </td>
                  <td style={styles.td}>{record.category}</td>
                  <td style={styles.td}>{record.subject}</td>
                  <td style={styles.td}>{record.title}</td>
                  <td style={styles.td}>
                    {record.marks_obtained}/{record.max_marks}
                  </td>
                  <td style={styles.td}>
                    <strong>{percentageValue.toFixed(1)}%</strong>
                  </td>
                  <td style={styles.td}>
                    {new Date(record.assessment_date).toLocaleDateString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    )}
  </div>
</section>


);
}

const styles = {
container: {
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
padding: "10px 14px",
border: "1px solid #cbd5e1",
borderRadius: "8px",
background: "#ffffff",
cursor: "pointer",
},

formCard: {
padding: "22px",
background: "#f8fafc",
borderRadius: "12px",
marginBottom: "28px",
},

sectionTitle: {
fontSize: "18px",
margin: "0 0 20px",
},

formGrid: {
display: "grid",
gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
gap: "16px",
marginBottom: "18px",
},

label: {
display: "flex",
flexDirection: "column",
gap: "8px",
fontSize: "14px",
fontWeight: 600,
marginBottom: "16px",
},

input: {
width: "100%",
padding: "11px",
border: "1px solid #cbd5e1",
borderRadius: "8px",
background: "#ffffff",
boxSizing: "border-box",
fontSize: "14px",
},

percentageBox: {
padding: "11px",
borderRadius: "8px",
background: "#dcfce7",
color: "#166534",
fontWeight: 700,
minHeight: "20px",
},

textarea: {
width: "100%",
padding: "12px",
border: "1px solid #cbd5e1",
borderRadius: "8px",
resize: "vertical",
fontFamily: "inherit",
boxSizing: "border-box",
},

saveButton: {
padding: "12px 20px",
border: "none",
borderRadius: "8px",
background: "#2563eb",
color: "#ffffff",
fontWeight: 600,
cursor: "pointer",
},

recordsCard: {
marginTop: "28px",
},

recordsHeader: {
display: "flex",
justifyContent: "space-between",
alignItems: "center",
flexWrap: "wrap",
gap: "12px",
marginBottom: "16px",
},

filter: {
padding: "10px",
border: "1px solid #cbd5e1",
borderRadius: "8px",
background: "#ffffff",
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

empty: {
textAlign: "center",
padding: "30px",
background: "#f8fafc",
borderRadius: "10px",
color: "#64748b",
},

error: {
padding: "12px",
marginBottom: "16px",
borderRadius: "8px",
background: "#fee2e2",
color: "#991b1b",
},

success: {
padding: "12px",
marginBottom: "16px",
borderRadius: "8px",
background: "#dcfce7",
color: "#166534",
},
};

export default PerformanceManagement;