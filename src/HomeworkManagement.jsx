import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

const BUCKET_NAME = "homework-files";
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

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

  // Load students and homework assignments
  async function loadData() {
    setLoading(true);

    try {
      const [studentResult, assignmentResult] = await Promise.all([
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

  // Upload teacher's attachment to private Supabase Storage
  async function uploadAttachment(file) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");

    const filePath =
      `teacher-attachments/${crypto.randomUUID()}-${safeName}`;

    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (error) {
      throw new Error(`File upload failed: ${error.message}`);
    }

    return filePath;
  }

  // Create and assign homework
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

      if (selectedFile && selectedFile.size > MAX_FILE_SIZE) {
        setMessage("Please select a file smaller than 50 MB.");
        return;
      }

      const selectedStudents =
        studentId === "all"
          ? students
          : students.filter((student) => student.id === studentId);

      if (selectedStudents.length === 0) {
        setMessage(
          "Please register a student before assigning homework."
        );
        return;
      }

      // Upload the attachment once for all selected students
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
      }));

      const { error } = await supabase
        .from("assignments")
        .insert(rows);

      if (error) {
        // Remove uploaded file if saving the assignment fails
        if (uploadedPath) {
          const { error: removeError } = await supabase.storage
            .from(BUCKET_NAME)
            .remove([uploadedPath]);

          if (removeError) {
            console.error(
              "Unable to remove unused attachment:",
              removeError.message
            );
          }
        }

        setMessage(`Unable to create homework: ${error.message}`);
        return;
      }

      // Clear the form
      setTitle("");
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

      // Refresh the assignment list
      await loadData();

      setMessage("Homework assigned successfully! ✅");
    } catch (error) {
      setMessage(
        error.message || "Unable to create homework."
      );
    } finally {
      setSaving(false);
    }
  }

  // Open a private attachment using a temporary signed URL
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

  return (
    <section className="homework-management">
      <h2>📚 Homework Management</h2>

      <p>
        Create assignments, attach learning materials, and track deadlines.
      </p>

      <form
        onSubmit={createHomework}
        className="homework-form"
      >
        <label>
          Homework title
          <input
            type="text"
            value={title}
            onChange={(event) =>
              setTitle(event.target.value)
            }
            placeholder="e.g. Chapter 4 exercises"
            required
          />
        </label>

        <label>
          Subject
          <select
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
            <option>Other</option>
          </select>
        </label>

        <label>
          Instructions
          <textarea
            value={description}
            onChange={(event) =>
              setDescription(event.target.value)
            }
            placeholder="Explain what the student needs to complete."
            rows={4}
          />
        </label>

        <label>
          Due date
          <input
            type="date"
            value={dueDate}
            onChange={(event) =>
              setDueDate(event.target.value)
            }
          />
        </label>

        <label>
          Assign to
          <select
            value={studentId}
            onChange={(event) =>
              setStudentId(event.target.value)
            }
          >
            <option value="all">All students</option>

            {students.map((student) => (
              <option
                key={student.id}
                value={student.id}
              >
                {student.full_name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Attach a file or image (optional)
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

          <small>
            Maximum file size: 50 MB.
          </small>

          {selectedFile && (
            <p>
              Selected: {selectedFile.name}
              {" "}
              ({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)
            </p>
          )}
        </label>

        <button
          type="submit"
          disabled={saving || loading}
        >
          {saving
            ? "Uploading and assigning..."
            : "Assign Homework"}
        </button>
      </form>

      {message && (
        <p role="status" aria-live="polite">
          {message}
        </p>
      )}

      <h3>Assigned Homework</h3>

      {loading ? (
        <p>Loading homework...</p>
      ) : assignments.length === 0 ? (
        <p>No homework assigned yet.</p>
      ) : (
        <div className="homework-list">
          {assignments.map((assignment) => {
            const assignedStudent = students.find(
              (student) =>
                student.id === assignment.student_id
            );

            return (
              <article
                className="homework-card"
                key={assignment.id}
              >
                <h4>{assignment.title}</h4>

                <p>
                  <strong>Student:</strong>{" "}
                  {assignedStudent?.full_name || "Student"}
                </p>

                <p>
                  <strong>Subject:</strong>{" "}
                  {assignment.subject || "Not specified"}
                </p>

                <p>
                  {assignment.description ||
                    "No additional instructions."}
                </p>

                <p>
                  <strong>Due:</strong>{" "}
                  {assignment.due_date || "No deadline"}
                </p>

                <p>
                  <strong>Status:</strong>{" "}
                  {assignment.status || "Assigned"}
                </p>

                <p>
                  <strong>Assigned:</strong>{" "}
                  {assignment.assigned_at
                    ? new Date(
                        assignment.assigned_at
                      ).toLocaleDateString()
                    : "—"}
                </p>

                {assignment.attachment_path && (
                  <button
                    type="button"
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
    </section>
  );
}

export default HomeworkManagement;