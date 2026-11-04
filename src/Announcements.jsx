import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export default function Announcements() {
  const [students, setStudents] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [editingId, setEditingId] = useState(null);

  const [form, setForm] = useState({
    title: "",
    message: "",
    student_id: "",
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);

    const [studentResult, announcementResult] = await Promise.all([
      supabase.from("students").select("id, full_name").order("full_name"),
      supabase
        .from("announcements")
        .select("*")
        .order("created_at", { ascending: false }),
    ]);

    if (studentResult.error || announcementResult.error) {
      setMessage(
        studentResult.error?.message ||
        announcementResult.error?.message
      );
    } else {
      setStudents(studentResult.data || []);
      setAnnouncements(announcementResult.data || []);
    }

    setLoading(false);
  }

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function saveAnnouncement(e) {
    e.preventDefault();
    setMessage("");

    const announcementData = {
      title: form.title.trim(),
      message: form.message.trim(),
      student_id: form.student_id || null,
      updated_at: new Date().toISOString(),
    };

    let result;

    if (editingId) {
      result = await supabase
        .from("announcements")
        .update(announcementData)
        .eq("id", editingId);
    } else {
      result = await supabase
        .from("announcements")
        .insert(announcementData);
    }

    if (result.error) {
      setMessage(result.error.message);
      return;
    }

    setMessage(
      editingId
        ? "Announcement updated successfully!"
        : "Announcement published successfully!"
    );

    resetForm();
    await loadData();
  }

  function editAnnouncement(item) {
    setEditingId(item.id);
    setForm({
      title: item.title,
      message: item.message,
      student_id: item.student_id || "",
    });

    setMessage("");
  }

  async function deleteAnnouncement(id) {
    const confirmed = window.confirm(
      "Are you sure you want to delete this announcement?"
    );

    if (!confirmed) return;

    const { error } = await supabase
      .from("announcements")
      .delete()
      .eq("id", id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Announcement deleted.");
    await loadData();
  }

  function resetForm() {
    setEditingId(null);
    setForm({
      title: "",
      message: "",
      student_id: "",
    });
  }

  function getStudentName(id) {
    if (!id) return "All students";

    return (
      students.find((student) => student.id === id)?.full_name ||
      "Student"
    );
  }

  const styles = {
    container: {
      background: "#fff",
      padding: "24px",
      borderRadius: "16px",
      marginTop: "24px",
      boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
    },
    input: {
      width: "100%",
      padding: "12px",
      border: "1px solid #ddd",
      borderRadius: "8px",
      boxSizing: "border-box",
      marginTop: "6px",
      fontSize: "14px",
    },
    field: {
      marginBottom: "16px",
    },
    button: {
      background: "#6658c7",
      color: "#fff",
      border: "none",
      padding: "11px 18px",
      borderRadius: "8px",
      cursor: "pointer",
      fontWeight: "600",
      marginRight: "8px",
      marginTop: "8px",
    },
    card: {
      border: "1px solid #eee",
      padding: "18px",
      borderRadius: "12px",
      marginTop: "14px",
    },
  };

  return (
    <div style={styles.container}>
      <h2>Announcements</h2>

      <p style={{ color: "#777" }}>
        Share important updates with your students.
      </p>

      {message && (
        <p style={{
          color:
            message.includes("successfully") ||
            message.includes("deleted")
              ? "green"
              : "crimson",
        }}>
          {message}
        </p>
      )}

      <h3>
        {editingId ? "Edit Announcement" : "Create Announcement"}
      </h3>

      <form onSubmit={saveAnnouncement}>
        <div style={styles.field}>
          <label>Announcement Title *</label>
          <input
            name="title"
            value={form.title}
            onChange={handleChange}
            placeholder="e.g. Upcoming Test"
            required
            style={styles.input}
          />
        </div>

        <div style={styles.field}>
          <label>Message *</label>
          <textarea
            name="message"
            value={form.message}
            onChange={handleChange}
            placeholder="Write your announcement here..."
            rows="5"
            required
            style={styles.input}
          />
        </div>

        <div style={styles.field}>
          <label>Send To</label>
          <select
            name="student_id"
            value={form.student_id}
            onChange={handleChange}
            style={styles.input}
          >
            <option value="">All students</option>

            {students.map((student) => (
              <option key={student.id} value={student.id}>
                {student.full_name}
              </option>
            ))}
          </select>
        </div>

        <button type="submit" style={styles.button}>
          {editingId ? "Update Announcement" : "Publish Announcement"}
        </button>

        {editingId && (
          <button
            type="button"
            onClick={resetForm}
            style={{ ...styles.button, background: "#777" }}
          >
            Cancel
          </button>
        )}
      </form>

      <hr style={{
        margin: "28px 0",
        border: "none",
        borderTop: "1px solid #eee",
      }} />

      <h3>Published Announcements</h3>

      {loading ? (
        <p>Loading announcements...</p>
      ) : announcements.length === 0 ? (
        <p style={{ color: "#777" }}>
          No announcements published yet.
        </p>
      ) : (
        announcements.map((item) => (
          <div key={item.id} style={styles.card}>
            <h3>{item.title}</h3>

            <p style={{ whiteSpace: "pre-wrap" }}>
              {item.message}
            </p>

            <p style={{ color: "#6658c7", fontSize: "13px" }}>
              <strong>Recipient:</strong>{" "}
              {getStudentName(item.student_id)}
            </p>

            <p style={{ color: "#999", fontSize: "12px" }}>
              Published:{" "}
              {new Date(item.created_at).toLocaleString()}
            </p>

            <button
              type="button"
              onClick={() => editAnnouncement(item)}
              style={styles.button}
            >
              Edit
            </button>

            <button
              type="button"
              onClick={() => deleteAnnouncement(item.id)}
              style={{ ...styles.button, background: "#dc5555" }}
            >
              Delete
            </button>
          </div>
        ))
      )}
    </div>
  );
}