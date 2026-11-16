import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import "./SubjectNotesManagement.css";

const BUCKET_NAME = "subject-notes";
const MAX_FILE_SIZE = 50 * 1024 * 1024;

const EMPTY_FORM = {
  subject_id: "",
  title: "",
  description: "",
  teacher_name: "",
};

function SubjectNotesManagement() {
  const [subjects, setSubjects] = useState([]);
  const [notes, setNotes] = useState([]);
  const [students, setStudents] = useState([]);
  const [enrollments, setEnrollments] = useState([]);

  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedFile, setSelectedFile] = useState(null);
  const [editingNote, setEditingNote] = useState(null);

  const [sharingMode, setSharingMode] = useState("all");
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openingNote, setOpeningNote] = useState(null);

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");

  // =====================================
  // LOAD SUBJECTS, STUDENTS AND NOTES
  // =====================================

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setMessage("");

    try {
      const [
        subjectResult,
        noteResult,
        studentResult,
        enrollmentResult,
      ] = await Promise.all([

        supabase
          .from("subjects")
          .select("id, subject_name")
          .order("subject_name"),

        supabase
          .from("subject_notes")
          .select(
            "id, subject_id, title, description, file_name, file_path, teacher_name, uploaded_at, available_to_all"
          )
          .order("uploaded_at", { ascending: false }),

        supabase
          .from("students")
          .select("id, full_name")
          .order("full_name"),

        supabase
          .from("student_subjects")
          .select("student_id, subject_id"),
      ]);

      if (subjectResult.error) throw subjectResult.error;
      if (noteResult.error) throw noteResult.error;
      if (studentResult.error) throw studentResult.error;
      if (enrollmentResult.error) throw enrollmentResult.error;

      setSubjects(subjectResult.data || []);
      setNotes(noteResult.data || []);
      setStudents(studentResult.data || []);
      setEnrollments(enrollmentResult.data || []);

      if (!form.subject_id && subjectResult.data?.length) {
        setForm((previous) => ({
          ...previous,
          subject_id: String(subjectResult.data[0].id),
        }));
      }

    } catch (error) {
      console.error("Subject notes load error:", error);

      setMessage(
        error.message || "Unable to load subject notes."
      );

      setMessageType("error");

    } finally {
      setLoading(false);
    }
  }

  // =====================================
  // FORM CHANGES
  // =====================================

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));

    if (name === "subject_id") {
      setSelectedStudentIds([]);
    }
  }

  // =====================================
  // STUDENTS ENROLLED IN SELECTED SUBJECT
  // =====================================

  const eligibleStudents = students.filter((student) =>
    enrollments.some(
      (enrollment) =>
        String(enrollment.student_id) === String(student.id) &&
        String(enrollment.subject_id) === String(form.subject_id)
    )
  );

  // =====================================
  // SELECT / DESELECT STUDENTS
  // =====================================

  function toggleStudent(studentId) {
    const id = String(studentId);

    setSelectedStudentIds((previous) =>
      previous.includes(id)
        ? previous.filter((item) => item !== id)
        : [...previous, id]
    );
  }

  function selectAllStudents() {
    setSelectedStudentIds(
      eligibleStudents.map((student) => String(student.id))
    );
  }

  function clearSelectedStudents() {
    setSelectedStudentIds([]);
  }

  // =====================================
  // FILE UPLOAD
  // =====================================

  async function uploadFile(file, subjectId) {
    const safeName = file.name.replace(
      /[^a-zA-Z0-9._-]/g,
      "_"
    );

    const filePath =
      `${subjectId}/${crypto.randomUUID()}-${safeName}`;

    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (error) {
      throw new Error(
        `File upload failed: ${error.message}`
      );
    }

    return filePath;
  }

  // =====================================
  // RESET FORM
  // =====================================

  function resetForm() {
    setForm({
      ...EMPTY_FORM,
      subject_id: subjects.length
        ? String(subjects[0].id)
        : "",
    });

    setSelectedFile(null);
    setEditingNote(null);
    setSharingMode("all");
    setSelectedStudentIds([]);

    const input = document.getElementById(
      "subject-note-file"
    );

    if (input) {
      input.value = "";
    }
  }

  // =====================================
  // EDIT EXISTING NOTE
  // =====================================

  async function startEditing(note) {
    setMessage("");
    setEditingNote(note);

    setForm({
      subject_id: String(note.subject_id),
      title: note.title || "",
      description: note.description || "",
      teacher_name: note.teacher_name || "",
    });

    setSelectedFile(null);

    const input = document.getElementById(
      "subject-note-file"
    );

    if (input) {
      input.value = "";
    }

    try {
      if (note.available_to_all === true) {
        setSharingMode("all");
        setSelectedStudentIds([]);
      } else {
        setSharingMode("selected");

        const { data, error } = await supabase
          .from("subject_note_students")
          .select("student_id")
          .eq("note_id", note.id);

        if (error) throw error;

        setSelectedStudentIds(
          (data || []).map((item) =>
            String(item.student_id)
          )
        );
      }
    } catch (error) {
      setMessage(
        `Unable to load selected students: ${error.message}`
      );
      setMessageType("error");
    }

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  // =====================================
  // SAVE OR UPDATE NOTE
  // =====================================

  async function saveNote(event) {
    event.preventDefault();

    setSaving(true);
    setMessage("");

    let newlyUploadedPath = null;
    let databaseSaved = false;

    try {
      if (!form.subject_id) {
        throw new Error("Please select a subject.");
      }

      if (!form.title.trim()) {
        throw new Error("Please enter a material title.");
      }

      if (!form.teacher_name.trim()) {
        throw new Error("Please enter the teacher's name.");
      }

      if (!editingNote && !selectedFile) {
        throw new Error("Please select a file to upload.");
      }

      if (
        selectedFile &&
        selectedFile.size > MAX_FILE_SIZE
      ) {
        throw new Error("File must be smaller than 50 MB.");
      }

      if (sharingMode === "selected" &&
          selectedStudentIds.length === 0) {
        throw new Error(
          "Please select at least one student."
        );
      }

      const validSelectedStudents =
        eligibleStudents.filter((student) =>
          selectedStudentIds.includes(String(student.id))
        );

      if (
        sharingMode === "selected" &&
        validSelectedStudents.length === 0
      ) {
        throw new Error(
          "The selected students are not enrolled in this subject."
        );
      }

      // Upload file if selected

      if (selectedFile) {
        newlyUploadedPath = await uploadFile(
          selectedFile,
          form.subject_id
        );
      }

      // Prepare note record

      const payload = {
        subject_id: form.subject_id,
        title: form.title.trim(),
        description: form.description.trim() || null,
        teacher_name: form.teacher_name.trim(),
        available_to_all: sharingMode === "all",
      };

      if (selectedFile && newlyUploadedPath) {
        payload.file_name = selectedFile.name;
        payload.file_path = newlyUploadedPath;
      }

      let noteId;

      // UPDATE EXISTING NOTE

      if (editingNote) {
        const { error } = await supabase
          .from("subject_notes")
          .update(payload)
          .eq("id", editingNote.id);

        if (error) throw error;

        noteId = editingNote.id;

      } else {

        // CREATE NEW NOTE

        const { data, error } = await supabase
          .from("subject_notes")
          .insert({
            ...payload,
            file_name: selectedFile.name,
            file_path: newlyUploadedPath,
          })
          .select("id")
          .single();

        if (error) throw error;

        noteId = data.id;
      }

      databaseSaved = true;

      // REMOVE PREVIOUS STUDENT ACCESS RECORDS

      const { error: deleteRecipientsError } =
        await supabase
          .from("subject_note_students")
          .delete()
          .eq("note_id", noteId);

      if (deleteRecipientsError) {
        throw deleteRecipientsError;
      }

      // SAVE SELECTED STUDENT ACCESS

      if (sharingMode === "selected") {
        const recipientRows = validSelectedStudents.map(
          (student) => ({
            note_id: noteId,
            student_id: student.id,
          })
        );

        const { error: recipientError } = await supabase
          .from("subject_note_students")
          .insert(recipientRows);

        if (recipientError) {
          throw recipientError;
        }
      }

      // DELETE OLD FILE AFTER SUCCESSFUL REPLACEMENT

      if (
        editingNote &&
        newlyUploadedPath &&
        editingNote.file_path
      ) {
        const { error: cleanupError } =
          await supabase.storage
            .from(BUCKET_NAME)
            .remove([editingNote.file_path]);

        if (cleanupError) {
          console.warn(
            "Old file cleanup failed:",
            cleanupError.message
          );
        }
      }

      const wasEditing = Boolean(editingNote);

      resetForm();

      await loadData();

      setMessage(
        wasEditing
          ? "Study material updated successfully! ✅"
          : "Study material uploaded successfully! ✅"
      );

      setMessageType("success");

    } catch (error) {
      console.error("Save subject note error:", error);

      // Remove unused newly uploaded file only
      // when the database was not updated.

      if (newlyUploadedPath && !databaseSaved) {
        await supabase.storage
          .from(BUCKET_NAME)
          .remove([newlyUploadedPath]);
      }

      setMessage(
        error.message || "Unable to save study material."
      );

      setMessageType("error");

    } finally {
      setSaving(false);
    }
  }

  // =====================================
  // DELETE NOTE
  // =====================================

  async function deleteNote(note) {
    const confirmed = window.confirm(
      `Delete "${note.title}"? This cannot be undone.`
    );

    if (!confirmed) return;

    setMessage("");

    try {
      const { error } = await supabase
        .from("subject_notes")
        .delete()
        .eq("id", note.id);

      if (error) throw error;

      if (note.file_path) {
        const { error: storageError } =
          await supabase.storage
            .from(BUCKET_NAME)
            .remove([note.file_path]);

        if (storageError) {
          setMessage(
            `Note deleted, but file cleanup failed: ${storageError.message}`
          );

          setMessageType("error");
          await loadData();
          return;
        }
      }

      if (editingNote?.id === note.id) {
        resetForm();
      }

      await loadData();

      setMessage("Study material deleted successfully.");
      setMessageType("success");

    } catch (error) {
      setMessage(
        error.message || "Unable to delete this material."
      );

      setMessageType("error");
    }
  }

  // =====================================
  // OPEN NOTE
  // =====================================

  async function openNote(note) {
    setOpeningNote(note.id);

    const newTab = window.open("about:blank", "_blank");

    if (newTab) {
      newTab.opener = null;
    }

    try {
      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .createSignedUrl(note.file_path, 120);

      if (error) throw error;

      if (newTab) {
        newTab.location.href = data.signedUrl;
      } else {
        window.location.href = data.signedUrl;
      }

    } catch (error) {
      if (newTab) newTab.close();

      setMessage(
        error.message || "Unable to open this file."
      );

      setMessageType("error");

    } finally {
      setOpeningNote(null);
    }
  }

  // =====================================
  // SUBJECT NAME
  // =====================================

  function subjectName(subjectId) {
    return (
      subjects.find(
        (subject) =>
          String(subject.id) === String(subjectId)
      )?.subject_name || "Unknown subject"
    );
  }

  // =====================================
  // DATE FORMAT
  // =====================================

  function formatDate(value) {
    if (!value) return "—";

    return new Date(value).toLocaleDateString(
      "en-US",
      {
        day: "numeric",
        month: "short",
        year: "numeric",
      }
    );
  }

  // =====================================
  // GROUP NOTES BY SUBJECT
  // =====================================

  const groupedNotes = subjects.map((subject) => ({
    ...subject,

    notes: notes.filter(
      (note) =>
        String(note.subject_id) === String(subject.id)
    ),
  }));

  // =====================================
  // MAIN PAGE
  // =====================================

  return (
    <section className="subject-notes-management">

      {/* HEADER */}

      <div className="snm-header">

        <div>
          <span className="snm-eyebrow">
            LEARÑOVA • TEACHER SPACE
          </span>

          <h2>📚 Subject Notes Management</h2>

          <p>
            Upload and organise notes, worksheets and
            learning materials for each subject.
          </p>
        </div>

        <div className="snm-header-icon">
          📖
        </div>

      </div>


      {/* MESSAGE */}

      {message && (

        <div
          className={`snm-message ${
            messageType === "success"
              ? "snm-success"
              : "snm-error"
          }`}
          role="status"
          aria-live="polite"
        >
          {message}
        </div>

      )}


      {/* UPLOAD FORM */}

      <div className="snm-panel">

        <div className="snm-panel-heading">

          <span className="snm-panel-icon">
            📤
          </span>

          <div>
            <h3>
              {editingNote
                ? "Edit Study Material"
                : "Upload New Material"}
            </h3>

            <p>
              Choose a subject and select which students
              can access this material.
            </p>
          </div>

        </div>


        {subjects.length === 0 && !loading ? (

          <div className="snm-empty">
            No subjects found. Add subjects in Subject
            Management first.
          </div>

        ) : (

          <form
            className="snm-form"
            onSubmit={saveNote}
          >

            {/* SUBJECT AND TEACHER */}

            <div className="snm-form-row">

              <div className="snm-field">

                <label htmlFor="subject-note-subject">
                  Subject *
                </label>

                <select
                  id="subject-note-subject"
                  name="subject_id"
                  value={form.subject_id}
                  onChange={handleChange}
                  required
                >

                  <option value="">
                    Choose a subject
                  </option>

                  {subjects.map((subject) => (

                    <option
                      key={subject.id}
                      value={String(subject.id)}
                    >
                      {subject.subject_name}
                    </option>

                  ))}

                </select>

              </div>


              <div className="snm-field">

                <label htmlFor="subject-note-teacher">
                  Teacher Name *
                </label>

                <input
                  id="subject-note-teacher"
                  name="teacher_name"
                  value={form.teacher_name}
                  onChange={handleChange}
                  placeholder="Enter teacher name"
                  required
                />

              </div>

            </div>


            {/* MATERIAL TITLE */}

            <div className="snm-field">

              <label htmlFor="subject-note-title">
                Material Title *
              </label>

              <input
                id="subject-note-title"
                name="title"
                value={form.title}
                onChange={handleChange}
                placeholder="e.g. Chapter 1 – Living Organisms"
                required
              />

            </div>


            {/* DESCRIPTION */}

            <div className="snm-field">

              <label htmlFor="subject-note-description">
                Description
              </label>

              <textarea
                id="subject-note-description"
                name="description"
                value={form.description}
                onChange={handleChange}
                rows={3}
                placeholder="Briefly describe this study material."
              />

            </div>


            {/* STUDENT ACCESS SETTINGS */}

            <div className="snm-sharing-section">

              <h4>
                👩‍🎓 Make Available To
              </h4>

              <p>
                Choose who can access this study material.
              </p>


              <label className="snm-sharing-option">

                <input
                  type="radio"
                  name="sharingMode"
                  value="all"
                  checked={sharingMode === "all"}
                  onChange={() => {
                    setSharingMode("all");
                    setSelectedStudentIds([]);
                  }}
                />

                <span>
                  <strong>
                    All students enrolled in this subject
                  </strong>

                  <small>
                    Every student taking this subject can
                    access the uploaded material.
                  </small>
                </span>

              </label>


              <label className="snm-sharing-option">

                <input
                  type="radio"
                  name="sharingMode"
                  value="selected"
                  checked={sharingMode === "selected"}
                  onChange={() => setSharingMode("selected")}
                />

                <span>
                  <strong>
                    Select specific students
                  </strong>

                  <small>
                    Only the students selected below
                    can access this material.
                  </small>
                </span>

              </label>


              {/* STUDENT CHECKBOX LIST */}

              {sharingMode === "selected" && (

                <div className="snm-student-selection">

                  <div className="snm-student-selection-heading">

                    <strong>
                      Students enrolled in this subject
                    </strong>

                    <div>

                      <button
                        type="button"
                        onClick={selectAllStudents}
                      >
                        Select All
                      </button>

                      <button
                        type="button"
                        onClick={clearSelectedStudents}
                      >
                        Clear
                      </button>

                    </div>

                  </div>


                  <p className="snm-selected-count">
                    {selectedStudentIds.length} students selected
                  </p>


                  {eligibleStudents.length === 0 ? (

                    <div className="snm-empty-students">
                      No students are enrolled in this subject.
                      Please assign the subject through Subject
                      Management first.
                    </div>

                  ) : (

                    <div className="snm-student-checkbox-list">

                      {eligibleStudents.map((student) => (

                        <label
                          key={student.id}
                          className="snm-student-checkbox"
                        >

                          <input
                            type="checkbox"
                            checked={selectedStudentIds.includes(
                              String(student.id)
                            )}
                            onChange={() =>
                              toggleStudent(student.id)
                            }
                          />

                          <span>
                            👩‍🎓 {student.full_name}
                          </span>

                        </label>

                      ))}

                    </div>

                  )}

                </div>

              )}

            </div>


            {/* FILE UPLOAD */}

            <div className="snm-field">

              <label htmlFor="subject-note-file">
                {editingNote
                  ? "Replace File (optional)"
                  : "Upload File *"}
              </label>

              <div className="snm-upload-box">

                <span className="snm-upload-icon">
                  📁
                </span>

                <div>

                  <strong>
                    Choose a study material file
                  </strong>

                  <p>
                    PDF, Word, PowerPoint, Excel, text or image.
                    Maximum 50 MB.
                  </p>

                  <input
                    id="subject-note-file"
                    type="file"
                    accept="image/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt"
                    required={!editingNote}
                    onChange={(event) =>
                      setSelectedFile(
                        event.target.files?.[0] || null
                      )
                    }
                  />

                  {selectedFile && (

                    <small className="snm-selected-file">
                      Selected: {selectedFile.name}
                    </small>

                  )}

                  {editingNote && !selectedFile && (

                    <small className="snm-selected-file">
                      Current file: {editingNote.file_name}
                    </small>

                  )}

                </div>

              </div>

            </div>


            {/* BUTTONS */}

            <div className="snm-actions">

              <button
                type="submit"
                className="snm-primary-button"
                disabled={
                  saving ||
                  loading ||
                  subjects.length === 0 ||
                  (
                    sharingMode === "selected" &&
                    (
                      selectedStudentIds.length === 0 ||
                      eligibleStudents.length === 0
                    )
                  )
                }
              >

                {saving
                  ? "⏳ Saving..."
                  : editingNote
                    ? "💾 Update Material"
                    : "✨ Upload Material"}

              </button>


              {editingNote && (

                <button
                  type="button"
                  className="snm-cancel-button"
                  onClick={resetForm}
                  disabled={saving}
                >
                  Cancel
                </button>

              )}

            </div>

          </form>

        )}

      </div>


      {/* UPLOADED NOTES */}

      <div className="snm-panel snm-library-panel">

        <div className="snm-panel-heading">

          <span className="snm-panel-icon">
            🗂️
          </span>

          <div>
            <h3>Uploaded Study Materials</h3>

            <p>
              Browse learning materials grouped by subject.
            </p>
          </div>

          <span className="snm-count">
            {notes.length} files
          </span>

        </div>


        {loading ? (

          <p className="snm-muted">
            Loading study materials...
          </p>

        ) : notes.length === 0 ? (

          <div className="snm-empty">
            <span>🌷</span>
            <h4>No materials uploaded yet</h4>
            <p>
              Uploaded notes will appear here.
            </p>
          </div>

        ) : (

          <div className="snm-subject-groups">

            {groupedNotes.map((subject) => (

              <details
                className="snm-subject-group"
                key={subject.id}
              >

                <summary>

                  <div>
                    <strong>
                      {subject.subject_name}
                    </strong>

                    <small>
                      {subject.notes.length} files
                    </small>
                  </div>

                  <span>⌄</span>

                </summary>


                {subject.notes.length === 0 ? (

                  <p className="snm-no-subject-notes">
                    No materials uploaded for this subject yet.
                  </p>

                ) : (

                  <div className="snm-note-list">

                    {subject.notes.map((note) => (

                      <article
                        className="snm-note-card"
                        key={note.id}
                      >

                        <div className="snm-note-file-icon">
                          📄
                        </div>


                        <div className="snm-note-info">

                          <strong>{note.title}</strong>

                          {note.description && (
                            <p>{note.description}</p>
                          )}

                          <small>
                            👩‍🏫 {note.teacher_name || "Teacher"}
                            {" • "}
                            {note.file_name}
                            {" • "}
                            {formatDate(note.uploaded_at)}
                          </small>

                          <small className="snm-access-label">
                            🔒 {note.available_to_all
                              ? "All enrolled students"
                              : "Selected students only"}
                          </small>

                        </div>


                        <div className="snm-note-actions">

                          <button
                            type="button"
                            onClick={() => openNote(note)}
                            disabled={openingNote === note.id}
                          >
                            {openingNote === note.id
                              ? "Opening..."
                              : "Open"}
                          </button>

                          <button
                            type="button"
                            className="snm-edit-button"
                            onClick={() => startEditing(note)}
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            className="snm-delete-button"
                            onClick={() => deleteNote(note)}
                          >
                            Delete
                          </button>

                        </div>

                      </article>

                    ))}

                  </div>

                )}

              </details>

            ))}

          </div>

        )}

      </div>

    </section>
  );
}

export default SubjectNotesManagement;
