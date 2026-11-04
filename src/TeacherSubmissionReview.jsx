import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

const BUCKET_NAME = "homework-files";

function TeacherSubmissionReview() {
  const [submissions, setSubmissions] = useState([]);
  const [feedback, setFeedback] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("All");

  // Load all student submissions
  async function loadSubmissions() {
    setLoading(true);
    setMessage("");

    try {
      const { data, error } = await supabase
        .from("assignment_submissions")
        .select(`
          id,
          assignment_id,
          student_id,
          file_url,
          answer_text,
          submitted_at,
          review_status,
          teacher_feedback,
          reviewed_at,
          students (
            full_name,
            email
          ),
          assignments (
            title,
            subject,
            due_date
          )
        `)
        .order("submitted_at", { ascending: false });

      if (error) throw error;

      setSubmissions(data || []);

      const feedbackValues = {};

      (data || []).forEach((submission) => {
        feedbackValues[submission.id] =
          submission.teacher_feedback || "";
      });

      setFeedback(feedbackValues);
    } catch (error) {
      console.error("Unable to load submissions:", error);

      setMessage(
        `Could not load submissions: ${error.message}`
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSubmissions();
  }, []);

  // Open a student's uploaded file
  async function openSubmissionFile(filePath) {
    if (!filePath) {
      setMessage("This submission has no attached file.");
      return;
    }

    try {
      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .createSignedUrl(filePath, 60);

      if (error) throw error;

      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      console.error("Unable to open submission:", error);

      setMessage(
        `Could not open the file: ${error.message}`
      );
    }
  }

  // Accept homework or request corrections
  async function reviewSubmission(submission, newStatus) {
    const teacherFeedback = (
      feedback[submission.id] || ""
    ).trim();

    if (
      newStatus === "Recheck Required" &&
      !teacherFeedback
    ) {
      setMessage(
        "Please explain what the student needs to correct."
      );
      return;
    }

    const confirmed = window.confirm(
      newStatus === "Accepted"
        ? "Accept this homework submission?"
        : "Send this homework back for corrections?"
    );

    if (!confirmed) return;

    setSavingId(submission.id);
    setMessage("");

    try {
      const { error } = await supabase
        .from("assignment_submissions")
        .update({
          review_status: newStatus,
          teacher_feedback: teacherFeedback || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", submission.id);

      if (error) throw error;

      setMessage(
        newStatus === "Accepted"
          ? "Homework accepted successfully! ✓"
          : "Corrections requested successfully. ↻"
      );

      await loadSubmissions();
    } catch (error) {
      console.error("Unable to review submission:", error);

      setMessage(
        `Could not update the submission: ${error.message}`
      );
    } finally {
      setSavingId(null);
    }
  }

  const filteredSubmissions = submissions.filter(
    (submission) => {
      if (filter === "All") return true;

      return submission.review_status === filter;
    }
  );

  const counts = {
    total: submissions.length,
    submitted: submissions.filter(
      (item) => item.review_status === "Submitted"
    ).length,
    accepted: submissions.filter(
      (item) => item.review_status === "Accepted"
    ).length,
    recheck: submissions.filter(
      (item) => item.review_status === "Recheck Required"
    ).length,
  };

  function formatDate(dateString) {
    if (!dateString) return "—";

    return new Date(dateString).toLocaleString();
  }

  return (
    <section className="panel teacher-review-panel">
      <div className="review-header">
        <div>
          <h2>Homework Submissions 📚</h2>
          <p>
            Review student work, provide feedback, and track progress.
          </p>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={loadSubmissions}
          disabled={loading}
        >
          ↻ Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="review-summary">
        <div className="review-stat">
          <span>Total submissions</span>
          <strong>{counts.total}</strong>
        </div>

        <div className="review-stat">
          <span>Awaiting review</span>
          <strong>{counts.submitted}</strong>
        </div>

        <div className="review-stat">
          <span>Accepted</span>
          <strong>{counts.accepted}</strong>
        </div>

        <div className="review-stat">
          <span>Recheck required</span>
          <strong>{counts.recheck}</strong>
        </div>
      </div>

      {/* Filter submissions */}
      <div className="review-filter">
        <label htmlFor="submission-filter">
          Filter submissions:
        </label>

        <select
          id="submission-filter"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        >
          <option value="All">All submissions</option>
          <option value="Submitted">Awaiting review</option>
          <option value="Accepted">Accepted</option>
          <option value="Recheck Required">
            Recheck required
          </option>
        </select>
      </div>

      {message && (
        <div className="review-message" role="status">
          {message}
        </div>
      )}

      {loading ? (
        <p>Loading student submissions...</p>
      ) : filteredSubmissions.length === 0 ? (
        <div className="review-empty">
          <div>📝</div>
          <h3>No submissions found</h3>
          <p>
            Student submissions will appear here when they submit
            their homework.
          </p>
        </div>
      ) : (
        <div className="submission-list">
          {filteredSubmissions.map((submission) => {
            const student = submission.students;
            const assignment = submission.assignments;

            const isAccepted =
              submission.review_status === "Accepted";

            return (
              <article
                className="submission-card"
                key={submission.id}
              >
                <div className="submission-top">
                  <div>
                    <h3>
                      {assignment?.title || "Untitled homework"}
                    </h3>

                    <p className="submission-subject">
                      {assignment?.subject || "No subject specified"}
                    </p>
                  </div>

                  <span
                    className={`submission-status ${
                      submission.review_status === "Accepted"
                        ? "status-accepted"
                        : submission.review_status ===
                            "Recheck Required"
                          ? "status-recheck"
                          : "status-submitted"
                    }`}
                  >
                    {submission.review_status}
                  </span>
                </div>

                <div className="submission-student">
                  <strong>Student:</strong>{" "}
                  {student?.full_name || "Unknown student"}

                  {student?.email && (
                    <span> ({student.email})</span>
                  )}
                </div>

                <p className="submission-date">
                  <strong>Submitted:</strong>{" "}
                  {formatDate(submission.submitted_at)}
                </p>

                {assignment?.due_date && (
                  <p className="submission-date">
                    <strong>Deadline:</strong>{" "}
                    {assignment.due_date}
                  </p>
                )}

                {submission.answer_text && (
                  <div className="submission-answer">
                    <h4>Student's answer</h4>

                    <p>{submission.answer_text}</p>
                  </div>
                )}

                {submission.file_url && (
                  <button
                    type="button"
                    className="secondary-button file-button"
                    onClick={() =>
                      openSubmissionFile(submission.file_url)
                    }
                  >
                    📎 Open submitted file
                  </button>
                )}

                {submission.teacher_feedback && (
                  <div className="previous-feedback">
                    <strong>Previous feedback:</strong>
                    <p>{submission.teacher_feedback}</p>
                  </div>
                )}

                {isAccepted ? (
                  <div className="accepted-message">
                    ✓ This homework has been accepted.
                  </div>
                ) : (
                  <div className="review-actions">
                    <label>
                      Teacher feedback
                      <textarea
                        value={feedback[submission.id] || ""}
                        onChange={(event) =>
                          setFeedback((previous) => ({
                            ...previous,
                            [submission.id]: event.target.value,
                          }))
                        }
                        placeholder="Write feedback or explain the corrections needed..."
                        rows={3}
                      />
                    </label>

                    <div className="review-buttons">
                      <button
                        type="button"
                        className="accept-button"
                        disabled={savingId === submission.id}
                        onClick={() =>
                          reviewSubmission(submission, "Accepted")
                        }
                      >
                        {savingId === submission.id
                          ? "Saving..."
                          : "✓ Accept"}
                      </button>

                      <button
                        type="button"
                        className="recheck-button"
                        disabled={savingId === submission.id}
                        onClick={() =>
                          reviewSubmission(
                            submission,
                            "Recheck Required"
                          )
                        }
                      >
                        ↻ Recheck Required
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default TeacherSubmissionReview;