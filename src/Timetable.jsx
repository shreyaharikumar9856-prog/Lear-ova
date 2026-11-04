import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export default function Timetable() {
  const [students, setStudents] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [form, setForm] = useState({
    student_id: "",
    subject: "",
    day_of_week: "Monday",
    start_time: "",
    end_time: "",
    teacher_name: "",
    meeting_link: "",
    notes: "",
  });

  const days = [
    "Monday", "Tuesday", "Wednesday",
    "Thursday", "Friday", "Saturday", "Sunday",
  ];

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setMessage("");

    const [studentResult, scheduleResult] = await Promise.all([
      supabase.from("students").select("id, full_name").order("full_name"),
      supabase.from("timetable").select("*").order("day_of_week").order("start_time"),
    ]);

    if (studentResult.error || scheduleResult.error) {
      setMessage(
        studentResult.error?.message || scheduleResult.error?.message
      );
    } else {
      setStudents(studentResult.data || []);
      setSchedules(scheduleResult.data || []);
    }

    setLoading(false);
  }

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function addSchedule(e) {
    e.preventDefault();
    setMessage("");

    const { error } = await supabase.from("timetable").insert({
      student_id: form.student_id || null,
      subject: form.subject.trim(),
      day_of_week: form.day_of_week,
      start_time: form.start_time,
      end_time: form.end_time,
      teacher_name: form.teacher_name.trim() || null,
      meeting_link: form.meeting_link.trim() || null,
      notes: form.notes.trim() || null,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Schedule added successfully!");
    setForm({
      student_id: "",
      subject: "",
      day_of_week: "Monday",
      start_time: "",
      end_time: "",
      teacher_name: "",
      meeting_link: "",
      notes: "",
    });

    await loadData();
  }

  async function deleteSchedule(id) {
    const confirmed = window.confirm(
      "Are you sure you want to delete this schedule?"
    );

    if (!confirmed) return;

    const { error } = await supabase
      .from("timetable")
      .delete()
      .eq("id", id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Schedule deleted.");
    await loadData();
  }

  function studentName(studentId) {
    if (!studentId) return "All students";
    return students.find((s) => s.id === studentId)?.full_name || "Student";
  }

  function formatTime(time) {
    if (!time) return "";
    const [hour, minute] = time.split(":");
    const date = new Date();
    date.setHours(Number(hour), Number(minute));
    return date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  const styles = {
    container: {
      background: "#ffffff",
      padding: "24px",
      borderRadius: "16px",
      marginTop: "24px",
      boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
    },
    input: {
      width: "100%",
      padding: "11px",
      border: "1px solid #ddd",
      borderRadius: "8px",
      boxSizing: "border-box",
      marginTop: "6px",
      fontSize: "14px",
    },
    field: { marginBottom: "14px" },
    button: {
      background: "#6658c7",
      color: "white",
      border: "none",
      padding: "12px 20px",
      borderRadius: "8px",
      cursor: "pointer",
      fontWeight: "600",
    },
    card: {
      border: "1px solid #eee",
      borderRadius: "12px",
      padding: "16px",
      marginTop: "12px",
    },
  };

  return (
    <div style={styles.container}>
      <h2>Class Timetable</h2>
      <p style={{ color: "#777" }}>
        Create and manage your students' class schedules.
      </p>

      {message && (
        <p style={{ color: message.includes("successfully") || message.includes("deleted") ? "green" : "crimson" }}>
          {message}
        </p>
      )}

      <h3>Add New Class</h3>

      <form onSubmit={addSchedule}>
        <div style={styles.field}>
          <label>Student</label>
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

        <div style={styles.field}>
          <label>Subject *</label>
          <input
            name="subject"
            value={form.subject}
            onChange={handleChange}
            placeholder="e.g. Mathematics"
            required
            style={styles.input}
          />
        </div>

        <div style={styles.field}>
          <label>Day *</label>
          <select
            name="day_of_week"
            value={form.day_of_week}
            onChange={handleChange}
            style={styles.input}
          >
            {days.map((day) => (
              <option key={day} value={day}>{day}</option>
            ))}
          </select>
        </div>

        <div style={styles.field}>
          <label>Start Time *</label>
          <input
            type="time"
            name="start_time"
            value={form.start_time}
            onChange={handleChange}
            required
            style={styles.input}
          />
        </div>

        <div style={styles.field}>
          <label>End Time *</label>
          <input
            type="time"
            name="end_time"
            value={form.end_time}
            onChange={handleChange}
            required
            style={styles.input}
          />
        </div>

        <div style={styles.field}>
          <label>Teacher Name</label>
          <input
            name="teacher_name"
            value={form.teacher_name}
            onChange={handleChange}
            placeholder="Teacher name"
            style={styles.input}
          />
        </div>

        <div style={styles.field}>
          <label>Meeting Link</label>
          <input
            type="url"
            name="meeting_link"
            value={form.meeting_link}
            onChange={handleChange}
            placeholder="https://..."
            style={styles.input}
          />
        </div>

        <div style={styles.field}>
          <label>Notes</label>
          <textarea
            name="notes"
            value={form.notes}
            onChange={handleChange}
            placeholder="Additional information"
            rows="3"
            style={styles.input}
          />
        </div>

        <button type="submit" style={styles.button}>
          Add Schedule
        </button>
      </form>

      <hr style={{ margin: "28px 0", border: "none", borderTop: "1px solid #eee" }} />

      <h3>Existing Schedules</h3>

      {loading ? (
        <p>Loading schedules...</p>
      ) : schedules.length === 0 ? (
        <p style={{ color: "#777" }}>No schedules added yet.</p>
      ) : (
        days.map((day) => {
          const daySchedules = schedules.filter(
            (schedule) => schedule.day_of_week === day
          );

          if (daySchedules.length === 0) return null;

          return (
            <div key={day}>
              <h4 style={{ color: "#6658c7" }}>{day}</h4>

              {daySchedules.map((schedule) => (
                <div key={schedule.id} style={styles.card}>
                  <strong>{schedule.subject}</strong>
                  <p>
                    {formatTime(schedule.start_time)} – {formatTime(schedule.end_time)}
                  </p>
                  <p>Student: {studentName(schedule.student_id)}</p>

                  {schedule.teacher_name && (
                    <p>Teacher: {schedule.teacher_name}</p>
                  )}

                  {schedule.notes && <p>Notes: {schedule.notes}</p>}

                  {schedule.meeting_link && (
                    <p>
                      <a href={schedule.meeting_link} target="_blank" rel="noreferrer">
                        Join Class
                      </a>
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={() => deleteSchedule(schedule.id)}
                    style={{
                      ...styles.button,
                      background: "#dc5555",
                      padding: "8px 14px",
                    }}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          );
        })
      )}
    </div>
  );
}