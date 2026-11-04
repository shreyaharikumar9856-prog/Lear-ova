import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

const BUCKET_NAME = "homework-files";
const MAX_FILE_SIZE = 50 * 1024 * 1024;

function StudentHomework() {
  const [student, setStudent] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [submissions, setSubmissions] = useState({});
  const [answers, setAnswers] = useState({});
  const [files, setFiles] = useState({});
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState(null);

  async function loadData() {
    setLoading(true);
    setMessage("");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;

      if (!user) {
        setMessage("Please log in to view your homework.");
        return;
      }

      const { data: studentData, error: studentError } =
        await supabase
          .from("students")
          .select("id, full_name")
          .eq("user_id", user.id)
          .maybeSingle();

      if (studentError) throw studentError;

      if (!studentData) {
        setMessage(
          "Your student profile was not found. Please contact your teacher."
        );
        return;
      }

      setStudent(studentData);

      const { data: assignmentData, error: assignmentError } =
        await supabase
          .from("assignments")
          .select(
            "id, title, subject, description, due_date, assigned_at, attachment_path, status"
          )
          .eq("student_id", studentData.id)
          .order("assigned_at", { ascending: false });

      if (assignmentError) throw assignmentError;

      setAssignments(assignmentData || []);

      const { data: submissionData, error: submissionError } =
        await supabase
          .from("assignment_submissions")
          .select(
            "id, assignment_id, answer_text, submitted_at, review_status, teacher_feedback, file_url"
          )
          .eq("student_id", studentData.id)
          .order("submitted_at", { ascending: false });

      if (submissionError) throw submissionError;

      const grouped = {};

      (submissionData || []).forEach((submission) => {
        if (!grouped[submission.assignment_id]) {
          grouped[submission.assignment_id] = [];
        }

        grouped[submission.assignment_id].push(submission);
      });

      setSubmissions(grouped);
    } catch (error) {
      setMessage(`Unable to load homework: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function openFile(filePath) {
    if (!filePath) return;

    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(filePath, 60);

    if (error) {
      setMessage(`Unable to open file: ${error.message}`);
      return;
    }

    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function submitHomework(assignment) {
    const assignmentId = assignment.id;
    const answerText = (answers[assignmentId] || "").trim();
    const selectedFile = files[assignmentId];

    if (!answerText && !selectedFile) {
      setMessage("Please type an answer or attach a file/image.");
      return;
    }

    if (selectedFile && selectedFile.size > MAX_FILE_SIZE) {
      setMessage("Please choose a file smaller than 50 MB.");
      return;
    }

    setSubmittingId(assignmentId);
    setMessage("");

    let uploadedPath = null;

    try {
      if (!student) {
        throw new Error("Student profile not found. Please log in again.");
      }

      if (selectedFile) {
        const safeName = selectedFile.name.replace(
          /[^a-zA-Z0-9._-]/g,
          "_"
        );

        uploadedPath =
          `student-submissions/${student.id}/${crypto.randomUUID()}-${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from(BUCKET_NAME)
          .upload(uploadedPath, selectedFile, {
            cacheControl: "3600",
            upsert: false,
          });

        if (uploadError) throw uploadError;
      }

      const { error: insertError } = await supabase
        .from("assignment_submissions")
        .insert({
          assignment_id: assignmentId,
          student_id: student.id,
          file_url: uploadedPath,
          answer_text: answerText || null,
          review_status: "Submitted",
        });

      if (insertError) {
        if (uploadedPath) {
          await supabase.storage
            .from(BUCKET_NAME)
            .remove([uploadedPath]);
        }

        throw insertError;
      }

      setAnswers((previous) => ({
        ...previous,
        [assignmentId]: "",
      }));

      setFiles((previous) => ({
        ...previous,
        [assignmentId]: null,
      }));

      setMessage("Homework submitted successfully! ✅");

      await loadData();
      setMessage("Homework submitted successfully! ✅");
    } catch (error) {
      setMessage(`Unable to submit homework: ${error.message}`);
    } finally {
      setSubmittingId(null);
    }
  }

  if (loading) {
    return <section><p>Loading your homework...</p></section>;
  }

  return (
    <section className="student-homework">
      <h2>📚 My Homework</h2>

      {student && <p>Welcome, {student.full_name}!</p>}

      {message && (
        <p role="status" aria-live="polite">
          {message}
        </p>
      )}

      {assignments.length === 0 ? (
        <p>No homework has been assigned to you yet.</p>
      ) : (
        <div className="homework-list">
          {assignments.map((assignment) => {
            const history = submissions[assignment.id] || [];
            const latestSubmission = history[0];

            const accepted = history.some(
              (item) => item.review_status === "Accepted"
            );

            return (
              <article
                className="homework-card"
                key={assignment.id}
              >
                <h3>{assignment.title}</h3>

                <p>
                  <strong>Subject:</strong>{" "}
                  {assignment.subject || "Not specified"}
                </p>

                <p>
                  {assignment.description ||
                    "No additional instructions."}
                </p>

                <p>
                  <strong>Deadline:</strong>{" "}
                  {assignment.due_date || "No deadline"}
                </p>

                {assignment.attachment_path && (
                  <button
                    type="button"
                    onClick={() =>
                      openFile(assignment.attachment_path)
                    }
                  >
                    📎 View Teacher's Attachment
                  </button>
                )}

                <hr />

                <h4>Your Submission</h4>

                {accepted ? (
                  <p>✅ Homework accepted and completed.</p>
                ) : (
                  <>
                    {latestSubmission && (
                      <p>
                        <strong>Latest status:</strong>{" "}
                        {latestSubmission.review_status}
                      </p>
                    )}

                    {latestSubmission?.teacher_feedback && (
                      <p>
                        <strong>Teacher feedback:</strong>{" "}
                        {latestSubmission.teacher_feedback}
                      </p>
                    )}

                    <label>
                      Your answer
                      <textarea
                        rows={4}
                        value={answers[assignment.id] || ""}
                        onChange={(event) =>
                          setAnswers((previous) => ({
                            ...previous,
                            [assignment.id]: event.target.value,
                          }))
                        }
                        placeholder="Type your answer here..."
                      />
                    </label>

                    <label>
                      Upload completed work
                      <input
                        type="file"
                        accept="image/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt"
                        onChange={(event) =>
                          setFiles((previous) => ({
                            ...previous,
                            [assignment.id]:
                              event.target.files?.[0] || null,
                          }))
                        }
                      />
                      <small>Maximum file size: 50 MB.</small>
                    </label>

                    {files[assignment.id] && (
                      <p>
                        Selected: {files[assignment.id].name}
                      </p>
                    )}

                    <button
                      type="button"
                      disabled={submittingId === assignment.id}
                      onClick={() => submitHomework(assignment)}
                    >
                      {submittingId === assignment.id
                        ? "Submitting..."
                        : latestSubmission
                          ? "Resubmit Homework"
                          : "Submit Homework"}
                    </button>
                  </>
                )}

                {history.length > 0 && (
                  <>
                    <h4>Submission History</h4>

                    {history.map((item, index) => (
                      <div key={item.id}>
                        <p>
                          Attempt {history.length - index}:{" "}
                          {new Date(
                            item.submitted_at
                          ).toLocaleString()}
                        </p>

                        <p>
                          Status: {item.review_status}
                        </p>

                        {item.answer_text && (
                          <p>Answer: {item.answer_text}</p>
                        )}

                        {item.file_url && (
                          <button
                            type="button"
                            onClick={() => openFile(item.file_url)}
                          >
                            📎 View Submitted File
                          </button>
                        )}

                        {item.teacher_feedback && (
                          <p>
                            Feedback: {item.teacher_feedback}
                          </p>
                        )}
                      </div>
                    ))}
                  </>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default StudentHomework;