import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

const initialForm = {
  student_id: "",
  subject: "",
  day_of_week: "Monday",
  start_hour: "",
  start_minute: "00",
  start_period: "PM",
  end_hour: "",
  end_minute: "00",
  end_period: "PM",
  teacher_name: "",
  meeting_link: "",
  notes: "",
};

export default function Timetable() {
  const [students, setStudents] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [activeTeacher, setActiveTeacher] = useState("All Teachers");

  const [form, setForm] = useState(initialForm);

  const days = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);

    const [studentResult, scheduleResult] = await Promise.all([
      supabase
        .from("students")
        .select("id, full_name")
        .order("full_name"),

      supabase
        .from("timetable")
        .select("*")
        .order("start_time"),
    ]);

    if (studentResult.error || scheduleResult.error) {
      setMessage(
        studentResult.error?.message ||
        scheduleResult.error?.message
      );
    } else {
      setStudents(studentResult.data || []);
      setSchedules(scheduleResult.data || []);
    }

    setLoading(false);
  }

  function handleChange(e) {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  }

  // Convert 12-hour time into database-compatible 24-hour time.

  function toDatabaseTime(hour, minute, period) {
    let h = Number(hour);

    if (period === "AM" && h === 12) {
      h = 0;
    } else if (period === "PM" && h !== 12) {
      h += 12;
    }

    return `${String(h).padStart(2, "0")}:${minute}:00`;
  }

  function getTimeMinutes(hour, minute, period) {
    let h = Number(hour);

    if (period === "AM" && h === 12) h = 0;
    if (period === "PM" && h !== 12) h += 12;

    return h * 60 + Number(minute);
  }

  // Convert database time into 12-hour format for editing.

  function parseDatabaseTime(time) {
    const [hourText, minuteText] = time.split(":");

    const hour = Number(hourText);

    return {
      hour: String(hour % 12 || 12),
      minute: String(minuteText).padStart(2, "0"),
      period: hour >= 12 ? "PM" : "AM",
    };
  }

  function formatTime(time) {
    if (!time) return "";

    const [hour, minute] = time.split(":").map(Number);

    const date = new Date();
    date.setHours(hour, minute, 0, 0);

    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  function renderTimePicker(label, prefix) {
    return (
      <div style={styles.field}>
        <label style={styles.label}>{label} *</label>

        <div style={styles.timeGrid}>
          <select
            value={form[`${prefix}_hour`]}
            onChange={(e) =>
              setForm({
                ...form,
                [`${prefix}_hour`]: e.target.value,
              })
            }
            required
            style={styles.input}
          >
            <option value="">Hour</option>

            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={String(i + 1)}>
                {i + 1}
              </option>
            ))}
          </select>

          <select
            value={form[`${prefix}_minute`]}
            onChange={(e) =>
              setForm({
                ...form,
                [`${prefix}_minute`]: e.target.value,
              })
            }
            style={styles.input}
          >
            {Array.from({ length: 60 }, (_, i) => {
              const minute = String(i).padStart(2, "0");

              return (
                <option key={minute} value={minute}>
                  {minute}
                </option>
              );
            })}
          </select>

          <select
            value={form[`${prefix}_period`]}
            onChange={(e) =>
              setForm({
                ...form,
                [`${prefix}_period`]: e.target.value,
              })
            }
            style={styles.input}
          >
            <option value="AM">AM</option>
            <option value="PM">PM</option>
          </select>
        </div>
      </div>
    );
  }

  async function addSchedule(e) {
    e.preventDefault();
    setMessage("");

    if (
      !form.start_hour ||
      !form.end_hour ||
      !form.teacher_name.trim()
    ) {
      setMessage("Please complete all required fields.");
      return;
    }

    const startMinutes = getTimeMinutes(
      form.start_hour,
      form.start_minute,
      form.start_period
    );

    const endMinutes = getTimeMinutes(
      form.end_hour,
      form.end_minute,
      form.end_period
    );

    if (endMinutes <= startMinutes) {
      setMessage("End time must be later than start time.");
      return;
    }

    const payload = {
      student_id: form.student_id || null,
      subject: form.subject.trim(),
      day_of_week: form.day_of_week,
      start_time: toDatabaseTime(
        form.start_hour,
        form.start_minute,
        form.start_period
      ),
      end_time: toDatabaseTime(
        form.end_hour,
        form.end_minute,
        form.end_period
      ),
      teacher_name: form.teacher_name.trim(),
      meeting_link: form.meeting_link.trim() || null,
      notes: form.notes.trim() || null,
    };

    let result;

    if (editingId) {
      result = await supabase
        .from("timetable")
        .update(payload)
        .eq("id", editingId);
    } else {
      result = await supabase
        .from("timetable")
        .insert(payload);
    }

    if (result.error) {
      setMessage(result.error.message);
      return;
    }

    const teacher = form.teacher_name.trim();

    setMessage(
      editingId
        ? "Schedule updated successfully!"
        : "Schedule added successfully!"
    );

    setForm(initialForm);
    setEditingId(null);
    setActiveTeacher(teacher);

    await loadData();
  }

  function editSchedule(schedule) {
    const start = parseDatabaseTime(schedule.start_time);
    const end = parseDatabaseTime(schedule.end_time);

    setForm({
      student_id: schedule.student_id || "",
      subject: schedule.subject,
      day_of_week: schedule.day_of_week,

      start_hour: start.hour,
      start_minute: start.minute,
      start_period: start.period,

      end_hour: end.hour,
      end_minute: end.minute,
      end_period: end.period,

      teacher_name: schedule.teacher_name || "",
      meeting_link: schedule.meeting_link || "",
      notes: schedule.notes || "",
    });

    setEditingId(schedule.id);
    setActiveTeacher(schedule.teacher_name || "All Teachers");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
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

    setMessage("Schedule deleted successfully!");

    await loadData();
  }

  function studentName(studentId) {
    if (!studentId) return "All students";

    return (
      students.find(
        (s) => String(s.id) === String(studentId)
      )?.full_name || "Student"
    );
  }

  // Automatically collect teacher names from saved schedules.

  const teachers = [
    ...new Set(
      schedules
        .map((schedule) => schedule.teacher_name)
        .filter(Boolean)
    ),
  ].sort();

  const visibleSchedules =
    activeTeacher === "All Teachers"
      ? schedules
      : schedules.filter(
          (schedule) =>
            schedule.teacher_name === activeTeacher
        );

  const styles = {
    container: {
      background: "#ffffff",
      padding: "26px",
      borderRadius: "20px",
      marginTop: "24px",
      boxShadow: "0 4px 18px rgba(100,80,160,0.08)",
      color: "#39354d",
    },

    grid: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
      gap: "16px",
    },

    field: {
      marginBottom: "16px",
    },

    label: {
      display: "block",
      fontWeight: "600",
      color: "#554b79",
      marginBottom: "7px",
      fontSize: "14px",
    },

    input: {
      width: "100%",
      padding: "12px",
      border: "1px solid #e2dcf5",
      borderRadius: "10px",
      boxSizing: "border-box",
      fontSize: "14px",
      color: "#39354d",
      background: "#f7f5ff",
      outline: "none",
      minWidth: 0,
    },

    timeGrid: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1fr",
      gap: "8px",
    },

    button: {
      background: "#7868d6",
      color: "#ffffff",
      border: "none",
      padding: "12px 20px",
      borderRadius: "10px",
      cursor: "pointer",
      fontWeight: "600",
    },

    card: {
      border: "1px solid #e9e3f8",
      borderRadius: "14px",
      padding: "18px",
      marginTop: "12px",
      background: "#fbfaff",
    },

    tabs: {
      display: "flex",
      flexWrap: "wrap",
      gap: "10px",
      margin: "18px 0",
    },

    tab: {
      padding: "10px 17px",
      borderRadius: "25px",
      border: "1px solid #e4dcf7",
      background: "#f7f4ff",
      color: "#65578d",
      cursor: "pointer",
      fontWeight: "600",
    },

    selectedTab: {
      background: "#7868d6",
      color: "#ffffff",
      border: "1px solid #7868d6",
    },
  };

  return (
    <div style={styles.container}>

      <h2 style={{ color: "#554b79" }}>
        📅 Class Timetable
      </h2>

      <p style={{ color: "#888" }}>
        Manage class schedules and meeting details.
      </p>

      {message && (
        <div
          style={{
            padding: "12px",
            borderRadius: "10px",
            margin: "15px 0",
            background: message.toLowerCase().includes("success")
              ? "#e9f8ee"
              : "#fff0f0",
            color: message.toLowerCase().includes("success")
              ? "#23834a"
              : "#c03939",
          }}
        >
          {message}
        </div>
      )}

      <h3 style={{ color: "#6d5ca8" }}>
        {editingId ? "Edit Class" : "Add New Class"}
      </h3>

      <form onSubmit={addSchedule}>

        <div style={styles.grid}>

          <div style={styles.field}>
            <label style={styles.label}>Student</label>

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
            <label style={styles.label}>Subject *</label>

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
            <label style={styles.label}>Day *</label>

            <select
              name="day_of_week"
              value={form.day_of_week}
              onChange={handleChange}
              style={styles.input}
            >
              {days.map((day) => (
                <option key={day} value={day}>
                  {day}
                </option>
              ))}
            </select>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Teacher Name *</label>

            <input
              name="teacher_name"
              value={form.teacher_name}
              onChange={handleChange}
              placeholder="Enter teacher's name"
              required
              style={styles.input}
            />
          </div>

        </div>

        <div style={styles.grid}>

          {renderTimePicker("Start Time", "start")}

          {renderTimePicker("End Time", "end")}

        </div>

        <div style={styles.field}>
          <label style={styles.label}>Meeting Link</label>

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
          <label style={styles.label}>Notes</label>

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
          {editingId ? "Update Schedule" : "Add Schedule"}
        </button>

        {editingId && (
          <button
            type="button"
            onClick={() => {
              setForm(initialForm);
              setEditingId(null);
              setMessage("");
            }}
            style={{
              ...styles.button,
              background: "#999",
              marginLeft: "10px",
            }}
          >
            Cancel
          </button>
        )}

      </form>

      <hr
        style={{
          margin: "30px 0",
          border: "none",
          borderTop: "1px solid #eee",
        }}
      />

      <h3 style={{ color: "#6d5ca8" }}>
        📚 Existing Schedules
      </h3>

      {/* Teacher Tabs */}

      <div style={styles.tabs}>

        {["All Teachers", ...teachers].map((teacher) => (

          <button
            key={teacher}
            type="button"
            onClick={() => setActiveTeacher(teacher)}
            style={{
              ...styles.tab,
              ...(activeTeacher === teacher
                ? styles.selectedTab
                : {}),
            }}
          >
            {teacher}
          </button>

        ))}

      </div>

      {loading ? (
        <p>Loading schedules...</p>
      ) : visibleSchedules.length === 0 ? (
        <p style={{ color: "#999" }}>
          No schedules available for this teacher.
        </p>
      ) : (

        days.map((day) => {

          const daySchedules = visibleSchedules
            .filter(
              (schedule) => schedule.day_of_week === day
            )
            .sort((a, b) =>
              a.start_time.localeCompare(b.start_time)
            );

          if (daySchedules.length === 0) return null;

          return (

            <div key={day}>

              <h4 style={{ color: "#7868d6" }}>
                📅 {day}
              </h4>

              {daySchedules.map((schedule) => (

                <div key={schedule.id} style={styles.card}>

                  <h3 style={{ color: "#554b79", marginTop: 0 }}>
                    {schedule.subject}
                  </h3>

                  <p>
                    🕒 {formatTime(schedule.start_time)}
                    {" – "}
                    {formatTime(schedule.end_time)}
                  </p>

                  <p>
                    👩‍🎓 Student:{" "}
                    {studentName(schedule.student_id)}
                  </p>

                  <p>
                    👩‍🏫 Teacher:{" "}
                    {schedule.teacher_name || "Not specified"}
                  </p>

                  {schedule.notes && (
                    <p>📝 {schedule.notes}</p>
                  )}

                  {schedule.meeting_link && (

                    <p>
                      🔗{" "}
                      <a
                        href={schedule.meeting_link}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "#7868d6", fontWeight: "600" }}
                      >
                        Join Class
                      </a>
                    </p>

                  )}

                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>

                    <button
                      type="button"
                      onClick={() => editSchedule(schedule)}
                      style={styles.button}
                    >
                      ✏️ Edit
                    </button>

                    <button
                      type="button"
                      onClick={() => deleteSchedule(schedule.id)}
                      style={{
                        ...styles.button,
                        background: "#e47b86",
                      }}
                    >
                      🗑 Delete
                    </button>

                  </div>

                </div>

              ))}

            </div>

          );

        })

      )}

    </div>
  );
}0
