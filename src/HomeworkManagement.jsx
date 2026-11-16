import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import "./HomeworkManagement.css";

const BUCKET_NAME = "homework-files";
const MAX_FILE_SIZE = 50 * 1024 * 1024;

function HomeworkManagement() {
  const [students, setStudents] = useState([]);
  const [assignments, setAssignments] = useState([]);

  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("Mathematics");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [studentId, setStudentId] = useState("all");
  const [selectedFile, setSelectedFile] = useState(null);

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // LOAD STUDENTS AND ASSIGNMENTS

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
              "id, student_id, title, subject, description, due_date, assigned_at, attachment_path, status"
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

  // CREATE HOMEWORK

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

      // Upload attachment once

      if (selectedFile) {
        uploadedPath = await uploadAttachment(selectedFile);
      }

      // Create assignment for selected students

      const rows = selectedStudents.map((student) => ({
        student_id: student.id,
        title: title.trim(),
        subject,
        description: description.trim(),
        due_date: dueDate || null,
        status: "Assigned",
        attachment_path: uploadedPath,
      }));

      const { error } = await supabase
        .from("assignments")
        .insert(rows);

      if (error) {

        // Remove unused attachment if assignment fails

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

      // RESET FORM

      setTitle("");
      setSubject("Mathematics");
      setDescription("");
      setDueDate("");
      setStudentId("all");
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

  // OPEN ATTACHMENT

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

  // GET STUDENT NAME

  function getStudentName(studentId) {
    const student = students.find(
      (student) =>
        String(student.id) === String(studentId)
    );

    return student?.full_name || "Student";
  }

  // FORMAT DATE

  function formatDate(date) {
    if (!date) return "No deadline";

    return new Date(
      `${date}T00:00:00`
    ).toLocaleDateString("en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

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
            <p>Fill in the details below to assign homework.</p>
          </div>

        </div>


        <form
          onSubmit={createHomework}
          className="homework-form"
        >

          {/* ASSIGNMENT TITLE */}

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


          {/* DEADLINE */}

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


          {/* ATTACHMENT */}

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

                        if (input) input.value = "";
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


          {/* SUBMIT BUTTON */}

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
              View all homework assignments given to students.
            </p>
          </div>

          <span className="homework-count">
            {assignments.length} Assignments
          </span>

        </div>


        {loading ? (

          <div className="homework-loading">
            Loading homework...
          </div>

        ) : assignments.length === 0 ? (

          <div className="homework-no-assignments">

            <div>🌷</div>

            <h3>No homework assigned yet</h3>

            <p>
              Your assignments will appear here once you
              create them.
            </p>

          </div>

        ) : (

          <div className="homework-list">

            {assignments.map((assignment) => {

              const assignedStudent = getStudentName(
                assignment.student_id
              );

              return (

                <article
                  className="homework-card"
                  key={assignment.id}
                >

                  {/* CARD HEADER */}

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


                  {/* CARD INFORMATION */}

                  <div className="homework-card-info">

                    <div>
                      <span>👩‍🎓 Student</span>
                      <strong>{assignedStudent}</strong>
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

                    <strong>Instructions</strong>

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

              );

            })}

          </div>

        )}

      </div>

    </section>
  );
}

export default HomeworkManagement;
