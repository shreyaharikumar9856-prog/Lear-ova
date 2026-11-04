import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import "./StudentTimetable.css";

function StudentTimetable() {
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [studentName, setStudentName] = useState("");

  const days = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];

  // Format time into 5:00 PM
  const formatTime = (time) => {
    if (!time) return "";

    const [hours, minutes] = time.split(":");
    const date = new Date();

    date.setHours(Number(hours), Number(minutes), 0);

    return date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  // Fetch student's timetable
  useEffect(() => {
    let cancelled = false;
    let subscription = null;

    async function loadTimetable() {
      setLoading(true);
      setError("");

      try {
        // Get logged-in user
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) throw authError;

        if (!user) {
          throw new Error("Please log in to view your timetable.");
        }

        // Find student record
        const { data: student, error: studentError } = await supabase
          .from("students")
          .select("id, full_name")
          .eq("user_id", user.id)
          .maybeSingle();

        if (studentError) throw studentError;

        if (!student) {
          throw new Error("Student profile not found.");
        }

        if (cancelled) return;

        setStudentName(student.full_name || "Student");

        // Fetch only this student's classes
        const fetchClasses = async () => {
          const { data, error: timetableError } = await supabase
            .from("timetable")
            .select("*")
            .eq("student_id", student.id);

          if (timetableError) throw timetableError;

          if (cancelled) return;

          const sortedClasses = (data || []).sort((a, b) => {
            const dayDifference =
              days.indexOf(a.day_of_week) -
              days.indexOf(b.day_of_week);

            if (dayDifference !== 0) return dayDifference;

            return (a.start_time || "").localeCompare(
              b.start_time || ""
            );
          });

          setClasses(sortedClasses);
        };

        await fetchClasses();

        if (cancelled) return;

        // Listen for timetable changes
        subscription = supabase
          .channel(`student-timetable-${student.id}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "timetable",
              filter: `student_id=eq.${student.id}`,
            },
            () => {
              fetchClasses().catch((err) => {
                console.error("Timetable refresh error:", err);
              });
            }
          )
          .subscribe();
      } catch (err) {
        if (!cancelled) {
          console.error("Timetable error:", err);
          setError(err.message || "Unable to load timetable.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadTimetable();

    return () => {
      cancelled = true;

      if (subscription) {
        supabase.removeChannel(subscription);
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="timetable-loading">
        <div className="timetable-spinner"></div>
        <p>Preparing your timetable...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="timetable-empty">
        <div className="timetable-empty-icon">⚠️</div>
        <h2>Something went wrong</h2>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="student-timetable">

      {/* Header */}
      <div className="timetable-header">
        <div>
          <span className="timetable-tag">
            YOUR WEEKLY LEARNING PLAN 🌷
          </span>

          <h2>My Timetable</h2>

          <p>
            Hi {studentName}! Here's your class schedule.
          </p>
        </div>

        <div className="timetable-header-icon">
          🗓️
        </div>
      </div>

      {/* Summary */}
      <div className="timetable-summary">
        <div className="timetable-summary-card">
          <span>📚</span>
          <div>
            <h3>{classes.length}</h3>
            <p>Total classes</p>
          </div>
        </div>

        <div className="timetable-summary-card">
          <span>📅</span>
          <div>
            <h3>
              {new Set(classes.map((item) => item.day_of_week)).size}
            </h3>
            <p>Active days</p>
          </div>
        </div>
      </div>

      {/* Empty state */}
      {classes.length === 0 ? (
        <div className="timetable-empty">
          <div className="timetable-empty-icon">🌼</div>

          <h2>No classes scheduled yet!</h2>

          <p>
            Your teacher hasn't assigned any classes to your timetable.
            Check back soon!
          </p>
        </div>
      ) : (
        <div className="weekly-timetable">

          {days.map((day) => {
            const dayClasses = classes.filter(
              (item) => item.day_of_week === day
            );

            return (
              <div className="timetable-day" key={day}>

                <div className="timetable-day-heading">
                  <div className="day-icon">📅</div>
                  <h3>{day}</h3>
                  <span>
                    {dayClasses.length}{" "}
                    {dayClasses.length === 1 ? "class" : "classes"}
                  </span>
                </div>

                {dayClasses.length === 0 ? (
                  <p className="no-class-text">
                    No classes scheduled
                  </p>
                ) : (
                  <div className="day-class-list">
                    {dayClasses.map((item) => (
                      <div
                        className="timetable-class-card"
                        key={item.id}
                      >
                        <div className="class-time">
                          <strong>
                            {formatTime(item.start_time)}
                          </strong>

                          <span>
                            {formatTime(item.end_time)}
                          </span>
                        </div>

                        <div className="class-details">
                          <h4>{item.subject}</h4>

                          <p>
                            👩‍🏫 {item.teacher_name || "Teacher"}
                          </p>

                          {item.notes && (
                            <p className="class-notes">
                              📝 {item.notes}
                            </p>
                          )}
                        </div>

                        {item.meeting_link && (
                          <a
                            href={item.meeting_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="join-class-button"
                          >
                            Join Class ↗
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

        </div>
      )}
    </div>
  );
}

export default StudentTimetable;