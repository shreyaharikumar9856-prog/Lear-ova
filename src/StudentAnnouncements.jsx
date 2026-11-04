import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export default function StudentAnnouncements() {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadAnnouncements() {
    setLoading(true);
    setError("");

    try {
      const { data: authData, error: authError } =
        await supabase.auth.getUser();

      if (authError) throw authError;

      if (!authData.user) {
        throw new Error("Please log in again.");
      }

      const { data: student, error: studentError } =
        await supabase
          .from("students")
          .select("id")
          .eq("user_id", authData.user.id)
          .maybeSingle();

      if (studentError) throw studentError;

      if (!student) {
        throw new Error("Student profile not found.");
      }

      const { data, error: announcementError } =
        await supabase
          .from("announcements")
          .select("id, title, message, student_id, created_at")
          .or(`student_id.is.null,student_id.eq.${student.id}`)
          .order("created_at", { ascending: false });

      if (announcementError) throw announcementError;

      setAnnouncements(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAnnouncements();
  }, []);

  return (
    <section className="student-announcements">
      <h2>📢 Announcements</h2>

      <p>Stay updated with the latest news from your teacher!</p>

      <button type="button" onClick={loadAnnouncements}>
        🔄 Refresh
      </button>

      {loading && <p>Loading announcements...</p>}

      {error && <p role="alert">{error}</p>}

      {!loading && !error && announcements.length === 0 && (
        <p>No announcements yet. Check back later! 🌸</p>
      )}

      {!loading && !error && announcements.map((item) => (
        <article className="announcement-card" key={item.id}>
          <h3>📌 {item.title}</h3>

          <p>{item.message}</p>

          <small>
            {new Date(item.created_at).toLocaleString()}
          </small>
        </article>
      ))}
    </section>
  );
}