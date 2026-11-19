import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabaseClient";
import "./HomeworkManagement.css";

const BUCKET_NAME = "homework-files";
const MAX_FILE_SIZE = 50 * 1024 * 1024;

function HomeworkManagement() {
  const [students, setStudents] = useState([]);
  const [assignments, setAssignments] = useState([]);

  // Restore an unfinished homework draft when this page opens.
  const DRAFT_KEY = "learnova_homework_draft";

  function readHomeworkDraft() {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch (error) {
      console.error("Unable to read homework draft:", error);
      return {};
    }
  }

  const [initialDraft] = useState(readHomeworkDraft);
  const isClearingDraft = useRef(false);
  const draftBeforeEditing = useRef(null);
  const skipDraftSave = useRef(false);

  const [title, setTitle] = useState(initialDraft.title || "");
  const [subject, setSubject] = useState(initialDraft.subject || "Mathematics");
  const [description, setDescription] = useState(initialDraft.description || "");
  const [dueDate, setDueDate] = useState(initialDraft.dueDate || "");
  const [studentId, setStudentId] = useState(initialDraft.studentId || "all");
  const [teacherName, setTeacherName] = useState(initialDraft.teacherName || "");
  const [selectedFile, setSelectedFile] = useState(null);

  const [teacherFilter, setTeacherFilter] = useState("all");
  const [editingAssignmentId, setEditingAssignmentId] = useState(null);
  const [deletingAssignmentId, setDeletingAssignmentId] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Save text fields automatically so they survive an accidental page reload.
  useEffect(() => {
    if (editingAssignmentId) return;

    if (skipDraftSave.current) {
      skipDraftSave.current = false;
      return;
    }

    if (isClearingDraft.current) {
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch (error) {
        console.error("Unable to clear homework draft:", error);
      }
      isClearingDraft.current = false;
      return;
    }

    const draft = {
      title,
      subject,
      description,
      dueDate,
      studentId,
      teacherName,
    };

    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch (error) {
      console.error("Unable to save homework draft:", error);
    }
  }, [title, subject, description, dueDate, studentId, teacherName, editingAssignmentId]);

  // LOAD STUDENTS AND HOMEWORK

  async function loadData() {
    setLoading(true);

    try {
      const [studentResult, assignmentResult] =
        await Promise.all([
          supabase
            .from("students")
            .select("id, full_name, email")
            .order("full_name"),

          supabase
            .from("assignments")
            .select(
              "id, student_id, title, subject, description, due_date, assigned_at, attachment_path, status, teacher_name"
            )
            .order("assigned_at", { ascending: false }),
        ]);

      if (studentResult.error) {
        setMessage(
          `Unable to load students: ${studentResult.error.message}`
        );
      } else {
        setStudents(studentResult.data || []);
      }

      if (assignmentResult.error) {
        setMessage(
          `Unable to load homework: ${assignmentResult.error.message}`
        );
      } else {
        setAssignments(assignmentResult.data || []);
      }

    } catch (error) {
      setMessage(`Something went wrong: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  // UPLOAD ATTACHMENT

  async function uploadAttachment(file) {
    const safeName = file.name.replace(
      /[^a-zA-Z0-9._-]/g,
      "_"
    );

    const filePath =
      `teacher-attachments/${crypto.randomUUID()}-${safeName}`;

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

  // RESTORE THE FORM VALUES THAT WERE PRESENT BEFORE EDITING.

  function restoreFormAfterEditing() {
    const previous = draftBeforeEditing.current || {};
    skipDraftSave.current = true;

    setTitle(previous.title || "");
    setSubject(previous.subject || "Mathematics");
    setDescription(previous.description || "");
    setDueDate(previous.dueDate || "");
    setStudentId(previous.studentId || "all");
    setTeacherName(previous.teacherName || "");
    setSelectedFile(null);
    setEditingAssignmentId(null);
    draftBeforeEditing.current = null;

    const fileInput = document.getElementById("homework-attachment");
    if (fileInput) fileInput.value = "";
  }

  // START EDITING ONE STUDENT'S HOMEWORK RECORD.

  function startEditing(assignment) {
    draftBeforeEditing.current = {
      title,
      subject,
      description,
      dueDate,
      studentId,
      teacherName,
    };

    setEditingAssignmentId(assignment.id);
    setTitle(assignment.title || "");
    setSubject(assignment.subject || "Mathematics");
    setDescription(assignment.description || "");
    setDueDate(assignment.due_date || "");
    setStudentId(String(assignment.student_id));
    setTeacherName(assignment.teacher_name || "");
    setSelectedFile(null);
    setMessage("Editing this student's homework. Other students' copies will not be changed.");

    const fileInput = document.getElementById("homework-attachment");
    if (fileInput) fileInput.value = "";

    document.getElementById("homework-form")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  // CREATE NEW HOMEWORK OR SAVE CHANGES TO AN EXISTING RECORD.

  async function createHomework(event) {
    event.preventDefault();

    setSaving(true);
    setMessage("");
    let uploadedPath = null;

    try {
      if (!title.trim()) {
        setMessage("Please enter a homework title.");
        return;
      }

      if (!teacherName.trim()) {
        setMessage("Please enter the teacher's name.");
        return;
      }

      if (!description.trim()) {
        setMessage("Please enter homework instructions.");
        return;
      }

      if (selectedFile && selectedFile.size > MAX_FILE_SIZE) {
        setMessage("Please select a file smaller than 50 MB.");
        return;
      }

      // EDIT MODE: update only the selected student's assignment row.
      if (editingAssignmentId) {
        const existingAssignment = assignments.find(
          (item) => String(item.id) === String(editingAssignmentId)
        );

        if (!existingAssignment) {
          setMessage("This homework could not be found. Please refresh and try again.");
          return;
        }

        if (selectedFile) {
          uploadedPath = await uploadAttachment(selectedFile);
        }

        const updatedValues = {
          title: title.trim(),
          subject,
          description: description.trim(),
          due_date: dueDate || null,
          teacher_name: teacherName.trim(),
          attachment_path: uploadedPath || existingAssignment.attachment_path || null,
        };

        const { data: updatedRows, error: updateError } = await supabase
          .from("assignments")
          .update(updatedValues)
          .eq("id", editingAssignmentId)
          .select("id");

        if (updateError) {
          if (uploadedPath) {
            await supabase.storage.from(BUCKET_NAME).remove([uploadedPath]);
          }
          throw updateError;
        }

        if (!updatedRows || updatedRows.length === 0) {
          if (uploadedPath) {
            await supabase.storage.from(BUCKET_NAME).remove([uploadedPath]);
          }
          throw new Error("Homework was not updated. Please check your teacher permissions and try again.");
        }

        // Remove the previous attachment only when no assignment still uses it.
        if (
          uploadedPath &&
          existingAssignment.attachment_path &&
          existingAssignment.attachment_path !== uploadedPath
        ) {
          const { count, error: countError } = await supabase
            .from("assignments")
            .select("id", { count: "exact", head: true })
            .eq("attachment_path", existingAssignment.attachment_path);

          if (!countError && count === 0) {
            const { error: removeError } = await supabase.storage
              .from(BUCKET_NAME)
              .remove([existingAssignment.attachment_path]);
            if (removeError) {
              console.warn("Updated homework, but the old attachment could not be removed:", removeError.message);
            }
          }
        }

        restoreFormAfterEditing();
        await loadData();
        setMessage("Homework updated successfully! ✅");
        return;
      }

      // CREATE MODE
      const selectedStudents =
        studentId === "all"
          ? students
          : students.filter(
              (student) => String(student.id) === String(studentId)
            );

      if (selectedStudents.length === 0) {
        setMessage("Please register a student before assigning homework.");
        return;
      }

      if (selectedFile) {
        uploadedPath = await uploadAttachment(selectedFile);
      }

      const rows = selectedStudents.map((student) => ({
        student_id: student.id,
        title: title.trim(),
        subject,
        description: description.trim(),
        due_date: dueDate || null,
        status: "Assigned",
        attachment_path: uploadedPath,
        teacher_name: teacherName.trim(),
      }));

      const { error } = await supabase.from("assignments").insert(rows);

      if (error) {
        if (uploadedPath) {
          const { error: removeError } = await supabase.storage
            .from(BUCKET_NAME)
            .remove([uploadedPath]);
          if (removeError) {
            console.error("Unable to remove unused attachment:", removeError.message);
          }
        }

        setMessage(`Unable to create homework: ${error.message}`);
        return;
      }

      isClearingDraft.current = true;
      setTitle("");
      setSubject("Mathematics");
      setDescription("");
      setDueDate("");
      setStudentId("all");
      setTeacherName("");
      setSelectedFile(null);

      const fileInput = document.getElementById("homework-attachment");
      if (fileInput) fileInput.value = "";

      await loadData();
      setMessage("Homework assigned successfully! 🎉");
    } catch (error) {
      setMessage(error.message || "Unable to save homework.");
    } finally {
      setSaving(false);
    }
  }

  // DELETE ONE HOMEWORK RECORD AND ITS ASSOCIATED STUDENT SUBMISSIONS.

  async function deleteHomework(assignment, studentName) {
    const confirmed = window.confirm(
      `Delete "${assignment.title}" for ${studentName}?\n\nAny submissions attached to this homework will also be deleted. This cannot be undone.`
    );

    if (!confirmed) return;

    setDeletingAssignmentId(assignment.id);
    setMessage("");

    try {
      // Collect student-submission files before deleting their database records.
      const { data: submissionRows, error: submissionFetchError } = await supabase
        .from("assignment_submissions")
        .select("file_url")
        .eq("assignment_id", assignment.id);

      if (submissionFetchError) throw submissionFetchError;

      // Remove linked submissions first so the assignment can be deleted cleanly.
      const { data: deletedSubmissionRows, error: submissionDeleteError } = await supabase
        .from("assignment_submissions")
        .delete()
        .eq("assignment_id", assignment.id)
        .select("id");

      if (submissionDeleteError) throw submissionDeleteError;
      if ((submissionRows || []).length > 0 && (deletedSubmissionRows || []).length !== submissionRows.length) {
        throw new Error("Some student submissions could not be deleted. Check the database permissions and try again.");
      }

      const { data: deletedAssignmentRows, error: assignmentDeleteError } = await supabase
        .from("assignments")
        .delete()
        .eq("id", assignment.id)
        .select("id");

      if (assignmentDeleteError) throw assignmentDeleteError;
      if (!deletedAssignmentRows || deletedAssignmentRows.length === 0) {
        throw new Error("No homework record was deleted. Please check your teacher permissions and try again.");
      }

      // Remove uploaded student response files after their records are deleted.
      const submissionPaths = [
        ...new Set((submissionRows || []).map((row) => row.file_url).filter(Boolean)),
      ];

      if (submissionPaths.length > 0) {
        const { error: removeSubmissionFilesError } = await supabase.storage
          .from(BUCKET_NAME)
          .remove(submissionPaths);
        if (removeSubmissionFilesError) {
          console.warn("Homework was deleted, but some submission files remain:", removeSubmissionFilesError.message);
        }
      }

      // Shared teacher attachments are kept while another assignment uses them.
      if (assignment.attachment_path) {
        const { count, error: countError } = await supabase
          .from("assignments")
          .select("id", { count: "exact", head: true })
          .eq("attachment_path", assignment.attachment_path);

        if (!countError && count === 0) {
          const { error: removeAttachmentError } = await supabase.storage
            .from(BUCKET_NAME)
            .remove([assignment.attachment_path]);
          if (removeAttachmentError) {
            console.warn("Homework was deleted, but its attachment could not be removed:", removeAttachmentError.message);
          }
        }
      }

      if (String(editingAssignmentId) === String(assignment.id)) {
        restoreFormAfterEditing();
      }

      await loadData();
      setMessage(`Homework deleted for ${studentName}.`);
    } catch (error) {
      setMessage(`Unable to delete homework: ${error.message}`);
    } finally {
      setDeletingAssignmentId(null);
    }
  }

  // OPEN PRIVATE ATTACHMENT

  async function openAttachment(filePath) {
    setMessage("");

    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(filePath, 60);

    if (error) {
      setMessage(
        `Unable to open attachment: ${error.message}`
      );
      return;
    }

    window.open(
      data.signedUrl,
      "_blank",
      "noopener,noreferrer"
    );
  }

  // FORMAT DATE

  function formatDate(date) {
    if (!date) return "No deadline";

    return new Date(`${date}T00:00:00`).toLocaleDateString(
      "en-US",
      {
        day: "numeric",
        month: "short",
        year: "numeric",
      }
    );
  }

  // TEACHER FILTER OPTIONS

  const teacherNames = [
    ...new Set(
      assignments
        .map((assignment) => assignment.teacher_name?.trim())
        .filter(Boolean)
    ),
  ].sort();

  // FILTER ASSIGNMENTS BY TEACHER

  const visibleAssignments = assignments.filter(
    (assignment) => {
      if (teacherFilter === "all") {
        return true;
      }

      if (teacherFilter === "__unassigned__") {
        return !assignment.teacher_name?.trim();
      }

      return (
        assignment.teacher_name?.trim() === teacherFilter
      );
    }
  );

  // GROUP HOMEWORK BY STUDENT

  const studentGroups = students
    .map((student) => ({
      ...student,

      homework: visibleAssignments.filter(
        (assignment) =>
          String(assignment.student_id) === String(student.id)
      ),
    }))
    .filter(
      (student) =>
        teacherFilter === "all" ||
        student.homework.length > 0
    );

  // MAIN PAGE

  return (
    <section className="homework-management">

      {/* HEADER */}

      <div className="homework-page-header">

        <div>
          <span className="homework-tag">
            LEARNOVA • TEACHER SPACE
          </span>

          <h2>📚 Homework Management</h2>

          <p>
            Create assignments, attach learning materials,
            and track deadlines.
          </p>
        </div>

        <div className="homework-header-icon">
          📝
        </div>

      </div>


      {/* CREATE HOMEWORK */}

      <div className="homework-panel">

        <div className="homework-panel-heading">

          <div className="homework-section-icon">
            ✏️
          </div>

          <div>
            <h3>{editingAssignmentId ? "Edit Homework" : "Create New Homework"}</h3>
            <p>
              {editingAssignmentId
                ? "Update the details for this student's homework."
                : "Fill in the details below to assign homework."}
            </p>
          </div>

        </div>


        <form
          id="homework-form"
          onSubmit={createHomework}
          className="homework-form"
        >

          {/* TEACHER NAME */}

          <div className="homework-field homework-full-width">

            <label htmlFor="homework-teacher">
              Teacher Name *
            </label>

            <input
              id="homework-teacher"
              type="text"
              value={teacherName}
              onChange={(event) =>
                setTeacherName(event.target.value)
              }
              placeholder="Enter teacher name"
              required
            />

          </div>


          {/* HOMEWORK TITLE */}

          <div className="homework-field homework-full-width">

            <label htmlFor="homework-title">
              Homework Title *
            </label>

            <input
              id="homework-title"
              type="text"
              value={title}
              onChange={(event) =>
                setTitle(event.target.value)
              }
              placeholder="e.g. Chapter 4 exercises"
              required
            />

          </div>


          {/* SUBJECT AND STUDENT */}

          <div className="homework-form-row">

            <div className="homework-field">

              <label htmlFor="homework-subject">
                Subject *
              </label>

              <select
                id="homework-subject"
                value={subject}
                onChange={(event) =>
                  setSubject(event.target.value)
                }
              >
                <option>Mathematics</option>
                <option>Science</option>
                <option>Biology</option>
                <option>Chemistry</option>
                <option>Physics</option>
                <option>English</option>
                <option>Hindi</option>
                <option>Malayalam</option>
                <option>Social Science</option>
                <option>Other</option>
              </select>

            </div>


            <div className="homework-field">

              <label htmlFor="homework-student">
                Assign To *
              </label>

              <select
                id="homework-student"
                value={studentId}
                onChange={(event) => setStudentId(event.target.value)}
                disabled={Boolean(editingAssignmentId)}
              >

                {!editingAssignmentId && (
                  <option value="all">All Students</option>
                )}

                {students.map((student) => (
                  <option
                    key={student.id}
                    value={student.id}
                  >
                    {student.full_name}
                  </option>
                ))}

              </select>

            </div>

          </div>


          {/* INSTRUCTIONS */}

          <div className="homework-field homework-full-width">

            <label htmlFor="homework-description">
              Instructions *
            </label>

            <textarea
              id="homework-description"
              value={description}
              onChange={(event) =>
                setDescription(event.target.value)
              }
              placeholder="Explain what the student needs to complete..."
              rows={5}
              required
            />

            <small>
              Provide clear instructions so students understand
              what they need to do.
            </small>

          </div>


          {/* DUE DATE */}

          <div className="homework-field homework-full-width">

            <label htmlFor="homework-date">
              📅 Due Date
            </label>

            <input
              id="homework-date"
              type="date"
              value={dueDate}
              onChange={(event) =>
                setDueDate(event.target.value)
              }
            />

          </div>


          {/* FILE UPLOAD */}

          <div className="homework-field homework-full-width">

            <label>
              📎 Attach Learning Material
            </label>

            <div className="homework-upload-box">

              <div className="homework-upload-icon">
                📁
              </div>

              <div className="homework-upload-content">

                <strong>
                  Upload a file or image
                </strong>

                <p>
                  PDF, Word, PowerPoint, Excel, or images
                </p>

                <label
                  htmlFor="homework-attachment"
                  className="homework-upload-button"
                >
                  Choose File
                </label>

                <input
                  id="homework-attachment"
                  type="file"
                  accept="image/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt"
                  onChange={(event) => {
                    setSelectedFile(
                      event.target.files?.[0] || null
                    );
                  }}
                />

                {selectedFile && (

                  <div className="homework-selected-file">

                    ✅ {selectedFile.name}

                    <span>
                      (
                      {(
                        selectedFile.size /
                        (1024 * 1024)
                      ).toFixed(2)} MB)
                    </span>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFile(null);

                        const input = document.getElementById(
                          "homework-attachment"
                        );

                        if (input) {
                          input.value = "";
                        }
                      }}
                      aria-label="Remove selected file"
                    >
                      ✕
                    </button>

                  </div>

                )}

              </div>

            </div>

            <small>
              Maximum file size: 50 MB.
              {editingAssignmentId
                ? " Leave the file field empty to keep the current attachment, or choose a new file to replace it."
                : ""}
            </small>

          </div>


          {/* MESSAGE */}

          {message && (

            <div
              className={`homework-message ${
                message.toLowerCase().includes("success") ||
                message.toLowerCase().includes("updated") ||
                message.toLowerCase().includes("deleted") ||
                message.toLowerCase().includes("editing")
                  ? "homework-success"
                  : "homework-error"
              }`}
              role="status"
              aria-live="polite"
            >
              {message}
            </div>

          )}


          {/* ASSIGN BUTTON */}

          <div className="homework-submit-area">

            <button
              type="submit"
              className="homework-submit-button"
              disabled={saving || loading}
            >
              {saving
                ? "⏳ Saving..."
                : editingAssignmentId
                  ? "💾 Save Changes"
                  : "✨ Assign Homework"}
            </button>

            {editingAssignmentId && (
              <button
                type="button"
                className="homework-cancel-edit-button"
                disabled={saving}
                onClick={restoreFormAfterEditing}
                style={{
                  marginLeft: "10px",
                  padding: "12px 18px",
                  border: "1px solid #D9C6E7",
                  borderRadius: "12px",
                  background: "#FFFFFF",
                  color: "#67477D",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Cancel Edit
              </button>
            )}

          </div>

        </form>

      </div>


      {/* ASSIGNED HOMEWORK */}

      <div className="homework-assigned-section">

        <div className="homework-panel-heading">

          <div className="homework-section-icon">
            📚
          </div>

          <div>
            <h3>Assigned Homework</h3>

            <p>
              View homework organised by student and teacher.
            </p>
          </div>

          <span className="homework-count">
            {visibleAssignments.length} Assignments
          </span>

        </div>


        {/* TEACHER FILTER */}

        <div className="homework-filter-toolbar">

          <div className="homework-filter-control">

            <label htmlFor="teacher-filter">
              👩‍🏫 Filter by Teacher
            </label>

            <select
              id="teacher-filter"
              value={teacherFilter}
              onChange={(event) =>
                setTeacherFilter(event.target.value)
              }
            >

              <option value="all">
                All Teachers
              </option>

              <option value="__unassigned__">
                Teacher Not Recorded
              </option>

              {teacherNames.map((teacher) => (

                <option
                  key={teacher}
                  value={teacher}
                >
                  {teacher}
                </option>

              ))}

            </select>

          </div>

        </div>


        {/* LOADING */}

        {loading ? (

          <div className="homework-loading">
            Loading homework...
          </div>

        ) : students.length === 0 ? (

          <div className="homework-no-assignments">
            <div>🌷</div>
            <h3>No students registered</h3>
          </div>

        ) : studentGroups.length === 0 ? (

          <div className="homework-no-assignments">
            <div>🌼</div>
            <h3>No assignments found</h3>
            <p>
              No homework is available for this teacher.
            </p>
          </div>

        ) : (

          /* STUDENT GROUPS */

          <div className="homework-student-groups">

            {studentGroups.map((student) => (

              <details
                className="homework-student-group"
                key={student.id}
              >

                {/* STUDENT NAME */}

                <summary className="homework-student-summary">

                  <div className="homework-student-info">

                    <span className="homework-student-avatar">
                      👩‍🎓
                    </span>

                    <div>

                      <strong>
                        {student.full_name}
                      </strong>

                      <small>
                        {student.homework.length}{" "}
                        {student.homework.length === 1
                          ? "assignment"
                          : "assignments"}
                      </small>

                    </div>

                  </div>

                  <span className="homework-dropdown-arrow">
                    ⌄
                  </span>

                </summary>


                {/* STUDENT HOMEWORK */}

                <div className="homework-student-content">

                  {student.homework.length === 0 ? (

                    <p className="homework-no-student-work">
                      No homework assigned to this student yet.
                    </p>

                  ) : (

                    <div className="homework-list">

                      {student.homework.map((assignment) => (

                        <article
                          className="homework-card"
                          key={assignment.id}
                        >

                          {/* HOMEWORK HEADER */}

                          <div className="homework-card-header">

                            <div>

                              <span className="homework-card-subject">
                                {assignment.subject || "Subject"}
                              </span>

                              <h4>
                                {assignment.title}
                              </h4>

                            </div>

                            <span className="homework-status">
                              {assignment.status || "Assigned"}
                            </span>

                          </div>


                          {/* HOMEWORK INFORMATION */}

                          <div className="homework-card-info">

                            <div>
                              <span>👩‍🏫 Teacher</span>

                              <strong>
                                {assignment.teacher_name ||
                                  "Not recorded"}
                              </strong>
                            </div>

                            <div>
                              <span>📅 Due Date</span>

                              <strong>
                                {formatDate(assignment.due_date)}
                              </strong>
                            </div>

                            <div>
                              <span>🕒 Assigned On</span>

                              <strong>
                                {assignment.assigned_at
                                  ? new Date(
                                      assignment.assigned_at
                                    ).toLocaleDateString()
                                  : "—"}
                              </strong>
                            </div>

                          </div>


                          {/* INSTRUCTIONS */}

                          <div className="homework-card-description">

                            <strong>
                              Instructions
                            </strong>

                            <p>
                              {assignment.description ||
                                "No additional instructions."}
                            </p>

                          </div>


                          {/* ATTACHMENT */}

                          {assignment.attachment_path && (

                            <button
                              type="button"
                              className="homework-attachment-button"
                              onClick={() =>
                                openAttachment(
                                  assignment.attachment_path
                                )
                              }
                            >
                              📎 Open Attachment
                            </button>

                          )}

                          <div
                            className="homework-card-actions"
                            style={{
                              display: "flex",
                              justifyContent: "flex-end",
                              flexWrap: "wrap",
                              gap: "10px",
                              marginTop: "18px",
                              padding: 0,
                              background: "transparent",
                              border: "none",
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => startEditing(assignment)}
                              disabled={saving || deletingAssignmentId === assignment.id}
                              style={{
                                margin: 0,
                                padding: "9px 15px",
                                border: "none",
                                borderRadius: "10px",
                                background: "#AD73C9",
                                color: "#FFFFFF",
                                fontWeight: 800,
                                cursor: "pointer",
                              }}
                            >
                              ✏️ Edit
                            </button>

                            <button
                              type="button"
                              onClick={() => deleteHomework(assignment, student.full_name)}
                              disabled={deletingAssignmentId === assignment.id || saving}
                              style={{
                                margin: 0,
                                padding: "9px 15px",
                                border: "none",
                                borderRadius: "10px",
                                background: "#D96C7A",
                                color: "#FFFFFF",
                                fontWeight: 800,
                                cursor: "pointer",
                                opacity: deletingAssignmentId === assignment.id ? 0.65 : 1,
                              }}
                            >
                              {deletingAssignmentId === assignment.id ? "Deleting..." : "🗑️ Delete"}
                            </button>
                          </div>

                        </article>

                      ))}

                    </div>

                  )}

                </div>

              </details>

            ))}

          </div>

        )}

      </div>

    </section>
  );
}

export default HomeworkManagement;
