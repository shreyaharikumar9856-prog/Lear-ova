import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import "./StudentSubjects.css";

const BUCKET_NAME = "subject-notes";

function StudentSubjects() {
  const [subjects, setSubjects] = useState([]);
  const [notesBySubject, setNotesBySubject] = useState({});
  const [loading, setLoading] = useState(true);
  const [notesLoading, setNotesLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [notesError, setNotesError] = useState("");
  const [expandedSubject, setExpandedSubject] = useState(null);
  const [openingNote, setOpeningNote] = useState(null);

  // =====================================
  // LOAD SUBJECTS AND THEIR NOTES
  // =====================================

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
        throw new Error(
          "Please log in to view your subjects."
        );
      }

      // Find logged-in student

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

      // Load notes belonging to assigned subjects

      const subjectIds = assignedSubjects.map(
        (subject) => subject.id
      );

      if (subjectIds.length === 0) {
        setNotesBySubject({});
        return;
      }

      setNotesLoading(true);
      setNotesError("");

      const { data: notes, error: notesQueryError } =
        await supabase
          .from("subject_notes")
          .select(`
            id,
            subject_id,
            title,
            description,
            file_name,
            file_path,
            uploaded_at
          `)
          .in("subject_id", subjectIds)
          .order("uploaded_at", {
            ascending: false,
          });

      if (notesQueryError) {
        setNotesError(
          notesQueryError.message
        );
        setNotesBySubject({});
      } else {
        // Organise notes subject-wise

        const groupedNotes = {};

        subjectIds.forEach((id) => {
          groupedNotes[id] = [];
        });

        (notes || []).forEach((note) => {
          const id = note.subject_id;

          if (!groupedNotes[id]) {
            groupedNotes[id] = [];
          }

          groupedNotes[id].push(note);
        });

        setNotesBySubject(groupedNotes);
      }

    } catch (error) {
      console.error("My Subjects error:", error);
      setErrorMessage(error.message);

    } finally {
      setLoading(false);
      setNotesLoading(false);
    }
  }

  // =====================================
  // INITIAL LOAD
  // =====================================

  useEffect(() => {
    loadSubjects();
  }, []);

  // =====================================
  // EXPAND SUBJECT TO VIEW NOTES
  // =====================================

  function toggleSubject(subjectId) {
    setExpandedSubject(
      expandedSubject === subjectId
        ? null
        : subjectId
    );
  }

  // =====================================
  // OPEN NOTES / STUDY MATERIAL
  // =====================================

  async function openNote(note) {
    setNotesError("");
    setOpeningNote(note.id);

    // Open a blank tab immediately to avoid popup blocking
    const newTab = window.open("about:blank", "_blank");

    try {
      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .createSignedUrl(note.file_path, 120);

      if (error) {
        newTab?.close();
        throw error;
      }

      if (newTab) {
        newTab.location.href = data.signedUrl;
      } else {
        window.location.href = data.signedUrl;
      }

    } catch (error) {
      console.error("Unable to open note:", error);

      newTab?.close();

      setNotesError(
        `Unable to open this material: ${error.message}`
      );

    } finally {
      setOpeningNote(null);
    }
  }

  // =====================================
  // LOADING SCREEN
  // =====================================

  if (loading) {
    return (
      <div className="subjects-loading">
        <span>🌸</span>
        <p>Loading your subjects...</p>
      </div>
    );
  }

  // =====================================
  // MAIN PAGE
  // =====================================

  return (
    <div className="student-subjects-page">

      {/* WELCOME HEADER */}

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

        <div className="subjects-banner-icon">
          📖
        </div>

      </div>


      {/* ERROR MESSAGE */}

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

        /* NO SUBJECTS */

        <div className="subjects-empty">

          <span>🌼</span>

          <h3>No subjects assigned yet!</h3>

          <p>
            Your teacher will add your subjects here.
          </p>

        </div>

      ) : (

        <>

          {/* SUBJECT SUMMARY */}

          <div className="subjects-summary">

            <div>
              <strong>{subjects.length}</strong>
              <span>Assigned subjects</span>
            </div>

          </div>


          {/* SUBJECT CARDS */}

          <div className="subjects-grid">

            {subjects.map((subject, index) => {

              const subjectNotes =
                notesBySubject[subject.id] || [];

              const isExpanded =
                expandedSubject === subject.id;

              return (

                <div
                  className={`student-subject-card ${
                    isExpanded
                      ? "subject-card-expanded"
                      : ""
                  }`}
                  key={subject.id}
                >

                  {/* SUBJECT INFORMATION */}

                  <button
                    type="button"
                    className="subject-card-open-button"
                    onClick={() =>
                      toggleSubject(subject.id)
                    }
                    aria-expanded={isExpanded}
                  >

                    <div
                      className={`subject-card-icon icon-${index % 5}`}
                    >
                      {subject.subject_icon || "📚"}
                    </div>

                    <div className="subject-card-content">

                      <h3>
                        {subject.subject_name}
                      </h3>

                      <p>
                        {subject.description ||
                          "Let's explore and learn something new!"}
                      </p>

                    </div>

                    <div className="subject-card-footer">

                      <span>
                        ✦ Assigned to you
                      </span>

                      <span>
                        {isExpanded ? "▲" : "📖"}
                      </span>

                    </div>

                  </button>


                  {/* SUBJECT NOTES */}

                  {isExpanded && (

                    <div className="subject-notes-panel">

                      <div className="subject-notes-heading">

                        <span>📚</span>

                        <div>
                          <h4>
                            {subject.subject_name} Notes
                          </h4>

                          <p>
                            Your study materials and learning resources.
                          </p>
                        </div>

                      </div>


                      {/* NOTES LOADING */}

                      {notesLoading ? (

                        <p className="subject-notes-empty">
                          Loading study materials...
                        </p>

                      ) : notesError ? (

                        <div className="subject-notes-empty">
                          <p>
                            Unable to load notes: {notesError}
                          </p>
                        </div>

                      ) : subjectNotes.length === 0 ? (

                        <div className="subject-notes-empty">

                          <span>🌷</span>

                          <p>
                            No notes uploaded yet.
                          </p>

                          <small>
                            Your teacher will upload learning
                            materials here.
                          </small>

                        </div>

                      ) : (

                        /* NOTES LIST */

                        <div className="subject-notes-list">

                          {subjectNotes.map((note) => (

                            <div
                              className="subject-note-card"
                              key={note.id}
                            >

                              <div className="subject-note-icon">
                                📄
                              </div>

                              <div className="subject-note-details">

                                <h5>
                                  {note.title}
                                </h5>

                                {note.description && (
                                  <p>
                                    {note.description}
                                  </p>
                                )}

                                {note.file_name && (
                                  <small>
                                    📎 {note.file_name}
                                  </small>
                                )}

                              </div>

                              <button
                                type="button"
                                className="subject-note-open-button"
                                onClick={() => openNote(note)}
                                disabled={openingNote === note.id}
                              >
                                {openingNote === note.id
                                  ? "Opening..."
                                  : "Open ↗"}
                              </button>

                            </div>

                          ))}

                        </div>

                      )}

                    </div>

                  )}

                </div>

              );

            })}

          </div>

        </>

      )}

    </div>
  );
}

export default StudentSubjects;
