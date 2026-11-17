import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabaseClient";
import "./HomeworkManagement.css";

const BUCKET_NAME = "homework-files";
const MAX_FILE_SIZE = 50 * 1024 * 1024;
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

function HomeworkManagement() {
  const [students, setStudents] = useState([]);
  const [assignments, setAssignments] = useState([]);

  const [initialDraft] = useState(readHomeworkDraft);
  const isClearingDraft = useRef(false);

  const [title, setTitle] = useState(initialDraft.title || "");
  const [subject, setSubject] = useState(initialDraft.subject || "Mathematics");
  const [description, setDescription] = useState(initialDraft.description || "");
  const [dueDate, setDueDate] = useState(initialDraft.dueDate || "");
  const [studentId, setStudentId] = useState(initialDraft.studentId || "all");
  const [teacherName, setTeacherName] = useState(initialDraft.teacherName || "");
  const [selectedFile, setSelectedFile] = useState(null);

  const [teacherFilter, setTeacherFilter] = useState("all");

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // AUTOMATIC HOMEWORK DRAFT SAVING

  useEffect(() => {
    if (isClearingDraft.current) {
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch (error) {
        console.error("Unable to clear draft:", error);
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
      console.error("Unable to save draft:", error);
    }
  }, [
    title,
    subject,
    description,
    dueDate,
    studentId,
    teacherName,
  ]);

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

  // CREATE AND ASSIGN HOMEWORK

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

      const selectedStudents =
        studentId === "all"
          ? students
          : students.filter(
              (student) =>
                String(student.id) === String(studentId)
            );

      if (selectedStudents.length === 0) {
        setMessage(
          "Please register a student before assigning homework."
        );
        return;
      }

      // UPLOAD ATTACHMENT

      if (selectedFile) {
        uploadedPath = await uploadAttachment(selectedFile);
      }

      // PREPARE HOMEWORK RECORDS

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

      const { error } = await supabase
        .from("assignments")
        .insert(rows);

      if (error) {
        if (uploadedPath) {
          const { error: removeError } =
            await supabase.storage
              .from(BUCKET_NAME)
              .remove([uploadedPath]);

          if (removeError) {
            console.error(
              "Unable to remove unused attachment:",
              removeError.message
            );
          }
        }

        setMessage(
          `Unable to create homework: ${error.message}`
        );

        return;
      }

      // CLEAR FORM AFTER SUCCESSFUL ASSIGNMENT

      isClearingDraft.current = true;

      setTitle("");
      setSubject("Mathematics");
      setDescription("");
      setDueDate("");
      setStudentId("all");
      setTeacherName("");
      setSelectedFile(null);

      const fileInput = document.getElementById(
        "homework-attachment"
      );

      if (fileInput) {
        fileInput.value = "";
      }

      await loadData();

      setMessage("Homework assigned successfully! 🎉");

    } catch (error) {
      setMessage(
        error.message || "Unable to create homework."
      );
    } finally {
      setSaving(false);
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
            <h3>Create New Homework</h3>
            <p>
              Fill in the details below to assign homework.
            </p>
          </div>
        </div>

        <form
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
                onChange={(event) =>
                  setStudentId(event.target.value)
                }
              >
                <option value="all">
                  All Students
                </option>

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
            </small>

          </div>

          {/* MESSAGE */}

          {message && (
            <div
              className={`homework-message ${
                message.toLowerCase().includes("success")
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
                ? "⏳ Uploading and assigning..."
                : "✨ Assign Homework"}
            </button>
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
