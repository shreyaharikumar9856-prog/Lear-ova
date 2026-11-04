import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import "./StudentSubjects.css";

function StudentSubjects() {
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  async function loadSubjects() {
    setLoading(true);
    setErrorMessage("");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;

      if (!user) {
        throw new Error("Please log in to view your subjects.");
      }

      // Find the logged-in student's profile
      const { data: student, error: studentError } =
        await supabase
          .from("students")
          .select("id, full_name")
          .eq("user_id", user.id)
          .maybeSingle();

      if (studentError) throw studentError;

      if (!student) {
        throw new Error("Student profile not found.");
      }

      // Fetch subjects assigned to this student
      const { data, error } = await supabase
        .from("student_subjects")
        .select(`
          id,
          assigned_at,
          subjects (
            id,
            subject_name,
            description,
            subject_icon
          )
        `)
        .eq("student_id", student.id);

      if (error) throw error;

      const assignedSubjects = (data || [])
        .filter((item) => item.subjects)
        .map((item) => ({
          ...item.subjects,
          assigned_at: item.assigned_at,
        }));

      setSubjects(assignedSubjects);
    } catch (error) {
      console.error("My Subjects error:", error);
      setErrorMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSubjects();
  }, []);

  if (loading) {
    return (
      <div className="subjects-loading">
        <span>🌸</span>
        <p>Loading your subjects...</p>
      </div>
    );
  }

  return (
    <div className="student-subjects-page">

      <div className="subjects-welcome">
        <div>
          <span className="subjects-label">
            ✨ YOUR LEARNING COLLECTION
          </span>

          <h2>My Subjects 📚</h2>

          <p>
            Every subject is a new adventure.
            Keep learning and growing!
          </p>
        </div>

        <div className="subjects-banner-icon">📖</div>
      </div>

      {errorMessage ? (
        <div className="subjects-empty">
          <span>🌷</span>
          <h3>Unable to load subjects</h3>
          <p>{errorMessage}</p>

          <button onClick={loadSubjects}>
            Try again
          </button>
        </div>
      ) : subjects.length === 0 ? (
        <div className="subjects-empty">
          <span>🌼</span>
          <h3>No subjects assigned yet!</h3>
          <p>
            Your teacher will add your subjects here.
          </p>
        </div>
      ) : (
        <>
          <div className="subjects-summary">
            <div>
              <strong>{subjects.length}</strong>
              <span>Assigned subjects</span>
            </div>
          </div>

          <div className="subjects-grid">
            {subjects.map((subject, index) => (
              <div
                className="student-subject-card"
                key={subject.id}
              >
                <div className={`subject-card-icon icon-${index % 5}`}>
                  {subject.subject_icon || "📚"}
                </div>

                <div className="subject-card-content">
                  <h3>{subject.subject_name}</h3>

                  <p>
                    {subject.description ||
                      "Let's explore and learn something new!"}
                  </p>
                </div>

                <div className="subject-card-footer">
                  <span>✦ Assigned to you</span>
                  <span>📖</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

    </div>
  );
}

export default StudentSubjects;