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
  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedFile, setSelectedFile] = useState(null);
  const [editingNote, setEditingNote] = useState(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openingNote, setOpeningNote] = useState(null);

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");

  // =====================================
  // LOAD SUBJECTS AND NOTES
  // =====================================

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setMessage("");

    try {
      const [subjectResult, noteResult] = await Promise.all([
        supabase
          .from("subjects")
          .select("id, subject_name")
          .order("subject_name"),

        supabase
          .from("subject_notes")
          .select(
            "id, subject_id, title, description, file_name, file_path, teacher_name, uploaded_at"
          )
          .order("uploaded_at", { ascending: false }),
      ]);

      if (subjectResult.error) throw subjectResult.error;
      if (noteResult.error) throw noteResult.error;

      setSubjects(subjectResult.data || []);
      setNotes(noteResult.data || []);

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
  // HANDLE FORM CHANGES
  // =====================================

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  // =====================================
  // UPLOAD FILE TO SUPABASE STORAGE
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

  function startEditing(note) {
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

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  // =====================================
  // SAVE OR UPDATE STUDY MATERIAL
  // =====================================

  async function saveNote(event) {
    event.preventDefault();

    setSaving(true);
    setMessage("");

    let newlyUploadedPath = null;

    try {
      if (!form.subject_id) {
        throw new Error("Please select a subject.");
      }

      if (!form.title.trim()) {
        throw new Error(
          "Please enter a title for the material."
        );
      }

      if (!form.teacher_name.trim()) {
        throw new Error(
          "Please enter the teacher's name."
        );
      }

      if (!editingNote && !selectedFile) {
        throw new Error(
          "Please select a file to upload."
        );
      }

      if (
        selectedFile &&
        selectedFile.size > MAX_FILE_SIZE
      ) {
        throw new Error(
          "Please select a file smaller than 50 MB."
        );
      }

      // Upload selected file

      if (selectedFile) {
        newlyUploadedPath = await uploadFile(
          selectedFile,
          form.subject_id
        );
      }

      // Prepare database record

      const payload = {
        subject_id: form.subject_id,
        title: form.title.trim(),
        description: form.description.trim() || null,
        teacher_name: form.teacher_name.trim(),
      };

      if (selectedFile && newlyUploadedPath) {
        payload.file_name = selectedFile.name;
        payload.file_path = newlyUploadedPath;
      }

      let result;

      // Update existing material

      if (editingNote) {
        result = await supabase
          .from("subject_notes")
          .update(payload)
          .eq("id", editingNote.id);

      } else {

        // Insert new material

        result = await supabase
          .from("subject_notes")
          .insert({
            ...payload,
            file_name: selectedFile.name,
            file_path: newlyUploadedPath,
          });
      }

      if (result.error) {
        if (newlyUploadedPath) {
          await supabase.storage
            .from(BUCKET_NAME)
            .remove([newlyUploadedPath]);
        }

        throw result.error;
      }

      // Remove old file after successful replacement

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
            "Old note file cleanup failed:",
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

      setMessage(
        error.message ||
          "Unable to save study material."
      );

      setMessageType("error");

    } finally {
      setSaving(false);
    }
  }

  // =====================================
  // DELETE STUDY MATERIAL
  // =====================================

  async function deleteNote(note) {
    const confirmed = window.confirm(
      `Delete "${note.title}"? This cannot be undone.`
    );

    if (!confirmed) return;

    setMessage("");

    try {
      const { error: deleteError } = await supabase
        .from("subject_notes")
        .delete()
        .eq("id", note.id);

      if (deleteError) {
        throw deleteError;
      }

      // Delete associated storage file

      if (note.file_path) {
        const { error: storageError } =
          await supabase.storage
            .from(BUCKET_NAME)
            .remove([note.file_path]);

        if (storageError) {
          setMessage(
            `The note record was deleted, but its stored file could not be removed: ${storageError.message}`
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

      setMessage(
        "Study material deleted successfully."
      );

      setMessageType("success");

    } catch (error) {
      console.error("Delete subject note error:", error);

      setMessage(
        error.message ||
          "Unable to delete this material."
      );

      setMessageType("error");
    }
  }

  // =====================================
  // OPEN STUDY MATERIAL
  // =====================================

  async function openNote(note) {
    setOpeningNote(note.id);
    setMessage("");

    // Open a tab during the click event

    const newTab = window.open("about:blank", "_blank");

    if (newTab) {
      newTab.opener = null;
    }

    try {
      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .createSignedUrl(note.file_path, 120);

      if (error) {
        throw error;
      }

      if (newTab) {
        newTab.location.href = data.signedUrl;
      } else {
        window.location.href = data.signedUrl;
      }

    } catch (error) {
      if (newTab) {
        newTab.close();
      }

      console.error("Open subject note error:", error);

      setMessage(
        error.message || "Unable to open this file."
      );

      setMessageType("error");

    } finally {
      setOpeningNote(null);
    }
  }

  // =====================================
  // GET SUBJECT NAME
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
  // FORMAT DATE
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

          <h2>
            📚 Subject Notes Management
          </h2>

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


      {/* UPLOAD PANEL */}

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
              Choose the subject so enrolled students can
              find the material in My Subjects.
            </p>

          </div>

        </div>


        {subjects.length === 0 && !loading ? (

          <div className="snm-empty">
            No subjects were found. Add subjects in
            Subject Management first.
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
                    PDF, Word, PowerPoint, Excel, text or image
                    • Max 50 MB
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

                      {" ("}

                      {(
                        selectedFile.size /
                        (1024 * 1024)
                      ).toFixed(2)}

                      {" MB)"}

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
                  subjects.length === 0
                }
              >

                {saving
                  ? "Saving..."
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


      {/* UPLOADED STUDY MATERIALS */}

      <div className="snm-panel snm-library-panel">

        <div className="snm-panel-heading">

          <span className="snm-panel-icon">
            🗂️
          </span>

          <div>

            <h3>
              Uploaded Study Materials
            </h3>

            <p>
              Browse materials grouped by subject.
            </p>

          </div>

          <span className="snm-count">
            {notes.length} files
          </span>

        </div>


        {/* LOADING */}

        {loading ? (

          <p className="snm-muted">
            Loading study materials...
          </p>

        ) : notes.length === 0 ? (

          <div className="snm-empty">

            <span>🌷</span>

            <h4>
              No materials uploaded yet
            </h4>

            <p>
              Uploaded notes will appear here,
              organised by subject.
            </p>

          </div>

        ) : (

          <div className="snm-subject-groups">

            {groupedNotes.map((subject) => (

              <details
                className="snm-subject-group"
                key={subject.id}
              >

                {/* SUBJECT HEADING */}

                <summary>

                  <div>

                    <strong>
                      {subject.subject_name}
                    </strong>

                    <small>

                      {subject.notes.length}{" "}

                      {subject.notes.length === 1
                        ? "file"
                        : "files"}

                    </small>

                  </div>

                  <span>⌄</span>

                </summary>


                {/* NO NOTES */}

                {subject.notes.length === 0 ? (

                  <p className="snm-no-subject-notes">
                    No materials uploaded for this subject yet.
                  </p>

                ) : (

                  /* NOTES LIST */

                  <div className="snm-note-list">

                    {subject.notes.map((note) => (

                      <article
                        className="snm-note-card"
                        key={note.id}
                      >

                        <div className="snm-note-file-icon">
                          📄
                        </div>


                        {/* NOTE INFORMATION */}

                        <div className="snm-note-info">

                          <strong>
                            {note.title}
                          </strong>

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

                        </div>


                        {/* NOTE ACTIONS */}

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
