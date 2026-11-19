import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import "./TeacherTestSubmissions.css";

// ==========================================
// HELPERS
// ==========================================

function formatDate(value) {
  if (!value) return "—";

  return new Date(value).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: true,
  });
}

function isSubjective(type) {
  return [
    "short_answer",
    "long_answer",
    "diagram_label",
  ].includes(type);
}

function hasWrittenAnswer(answer) {
  return Boolean(String(answer?.text || "").trim());
}

function getAnswerText(question, answer) {
  if (!answer) return "Not answered";

  const options = Array.isArray(question.options)
    ? question.options
    : [];

  switch (question.question_type) {
    case "mcq": {
      const option = options.find(
        (item) => item.id === answer.option_id
      );

      return option
        ? `${option.id}. ${option.text}`
        : answer.option_id || "Not answered";
    }

    case "multiple_select":
      return (answer.option_ids || [])
        .map((id) => {
          const option = options.find(
            (item) => item.id === id
          );

          return option
            ? `${option.id}. ${option.text}`
            : id;
        })
        .join(", ") || "Not answered";

    case "true_false":
      return typeof answer.value === "boolean"
        ? answer.value ? "True" : "False"
        : "Not answered";

    case "matching":
      return Object.entries(answer.pairs || {})
        .map(([left, right]) => `${left} → ${right}`)
        .join("\n") || "Not answered";

    case "ordering":
    default:
      return answer.text || "Not answered";
  }
}

function getCorrectAnswerText(question, key) {
  if (!key?.correct_answer) {
    return "Answer key unavailable.";
  }

  const answer = key.correct_answer;

  const options = Array.isArray(question.options)
    ? question.options
    : [];

  switch (question.question_type) {
    case "mcq": {
      const option = options.find(
        (item) => item.id === answer.option_id
      );

      return option
        ? `${option.id}. ${option.text}`
        : answer.option_id;
    }

    case "multiple_select":
      return (answer.option_ids || [])
        .map((id) => {
          const option = options.find(
            (item) => item.id === id
          );

          return option
            ? `${option.id}. ${option.text}`
            : id;
        })
        .join(", ");

    case "true_false":
      return answer.value ? "True" : "False";

    case "fill_blank":
    case "one_word":
      return (answer.accepted_answers || []).join(" / ");

    case "matching":
      return (answer.pairs || [])
        .map((pair) => `${pair.left} → ${pair.right}`)
        .join("\n");

    case "ordering":
      return (answer.correct_order || []).join("\n");

    case "short_answer":
    case "long_answer":
    case "diagram_label":
      return answer.model_answer || "No model answer provided.";

    default:
      return "Answer unavailable.";
  }
}

function getStatusLabel(item) {
  if (item.results_released && Number(item.pending_review_count) > 0) {
    return "Partial result released";
  }

  if (item.results_released) {
    return "Result released";
  }

  if (Number(item.pending_review_count) > 0) {
    return "Awaiting correction";
  }

  if (item.review_status === "completed") {
    return "Awaiting result release";
  }

  return "Submitted";
}

// ==========================================
// MAIN COMPONENT
// ==========================================

function TeacherTestSubmissions() {
  const [submissions, setSubmissions] = useState([]);
  const [selectedSubmission, setSelectedSubmission] = useState(null);

  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const [gradeDrafts, setGradeDrafts] = useState({});

  useEffect(() => {
    loadSubmissions();
  }, []);

  // ==========================================
  // LOAD SUBMISSIONS
  // ==========================================

  async function loadSubmissions() {
    setLoading(true);
    setError("");

    try {
      const { data, error: functionError } =
        await supabase.functions.invoke(
          "teacher-test-submissions",
          {
            body: {
              action: "list",
            },
          }
        );

      if (functionError) throw functionError;
      if (data?.error) throw new Error(data.error);

      setSubmissions(data?.submissions || []);
    } catch (err) {
      console.error("Submission loading error:", err);

      setError(
        err.message || "Unable to load test submissions."
      );
    } finally {
      setLoading(false);
    }
  }

  // ==========================================
  // LOAD INDIVIDUAL SUBMISSION
  // ==========================================

  async function loadSubmissionDetail(
    attemptId,
    showLoading = true
  ) {
    if (showLoading) {
      setDetailLoading(true);
      setError("");
      setMessage("");
    }

    try {
      const { data, error: functionError } =
        await supabase.functions.invoke(
          "teacher-test-submissions",
          {
            body: {
              action: "detail",
              attempt_id: attemptId,
            },
          }
        );

      if (functionError) throw functionError;
      if (data?.error) throw new Error(data.error);

      setSelectedSubmission(data);

      const drafts = {};

      (data.questions || []).forEach((question) => {
        if (question.response) {
          drafts[question.id] = {
            marks_awarded:
              question.response.marks_awarded ?? "",

            teacher_feedback:
              question.response.teacher_feedback || "",
          };
        }
      });

      setGradeDrafts(drafts);

    } catch (err) {
      console.error("Submission detail error:", err);

      setError(
        err.message || "Unable to open this submission."
      );
    } finally {
      setDetailLoading(false);
    }
  }

  async function openSubmission(item) {
    await loadSubmissionDetail(item.id);
  }

  // ==========================================
  // UPDATE MARKS AND FEEDBACK
  // ==========================================

  function updateGrade(questionId, field, value) {
    setGradeDrafts((previous) => ({
      ...previous,

      [questionId]: {
        ...previous[questionId],
        [field]: value,
      },
    }));
  }

  // ==========================================
  // SAVE TEACHER REVIEW
  // ==========================================

  async function saveReview(releaseResult = false) {
    if (!selectedSubmission || saving) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const grades = [];

      for (const question of selectedSubmission.questions || []) {
        if (!question.response) continue;

        const subjective = isSubjective(
          question.question_type
        );

        const draft = gradeDrafts[question.id] || {};

        const answered = subjective
          ? hasWrittenAnswer(question.response.answer)
          : true;

        // Written answers require marks.
        if (subjective && answered) {
          if (
            draft.marks_awarded === "" ||
            draft.marks_awarded === undefined
          ) {
            throw new Error(
              `Please enter marks for Question ${question.question_order}.`
            );
          }

          const marks = Number(draft.marks_awarded);

          if (
            !Number.isFinite(marks) ||
            marks < 0 ||
            marks > Number(question.marks)
          ) {
            throw new Error(
              `Question ${question.question_order}: marks must be between 0 and ${question.marks}.`
            );
          }
        }

        grades.push({
          question_id: question.id,

          ...(subjective && answered
            ? {
                marks_awarded: Number(
                  draft.marks_awarded
                ),
              }
            : {}),

          teacher_feedback:
            draft.teacher_feedback || "",
        });
      }

      const { data, error: functionError } =
        await supabase.functions.invoke(
          "teacher-test-submissions",
          {
            body: {
              action: "save_review",
              attempt_id: selectedSubmission.attempt.id,
              grades,
              release_result: releaseResult,
            },
          }
        );

      if (functionError) throw functionError;
      if (data?.error) throw new Error(data.error);

      setMessage(
        data.results_released
          ? "Corrections saved and result released successfully! 🎉"
          : "Corrections and feedback saved successfully."
      );

      // Refresh the submission and its latest data.
      await loadSubmissionDetail(
        selectedSubmission.attempt.id,
        false
      );

      await loadSubmissions();

    } catch (err) {
      console.error("Review saving error:", err);

      setError(
        err.message || "Unable to save corrections."
      );
    } finally {
      setSaving(false);
    }
  }

  // ==========================================
  // FILTER SUBMISSIONS
  // ==========================================

  const filteredSubmissions = submissions.filter((item) => {
    const matchesSearch =
      `${item.student_name} ${item.test_title}`
        .toLowerCase()
        .includes(search.toLowerCase());

    let matchesFilter = true;

    if (filter === "pending") {
      matchesFilter =
        Number(item.pending_review_count) > 0;
    }

    if (filter === "released") {
      matchesFilter = item.results_released;
    }

    if (filter === "unreleased") {
      matchesFilter = !item.results_released;
    }

    return matchesSearch && matchesFilter;
  });

  const pendingCount = submissions.filter(
    (item) => Number(item.pending_review_count) > 0
  ).length;

  const releasedCount = submissions.filter(
    (item) => item.results_released
  ).length;

  // ==========================================
  // LOADING DETAIL
  // ==========================================

  if (detailLoading) {
    return (
      <section className="teacher-test-submissions">
        <div className="tts-loading">
          Loading student submission...
        </div>
      </section>
    );
  }

  // ==========================================
  // INDIVIDUAL SUBMISSION REVIEW PAGE
  // ==========================================

  if (selectedSubmission) {
    const { attempt, test, student, questions } =
      selectedSubmission;

    const canRelease =
      Number(attempt.pending_review_count) === 0 &&
      !attempt.results_released;

    return (
      <section className="teacher-test-submissions">

        <button
          type="button"
          className="tts-back-button"
          onClick={() => {
            setSelectedSubmission(null);
            setMessage("");
            setError("");
            loadSubmissions();
          }}
        >
          ← Back to submissions
        </button>

        {/* HEADER */}

        <div className="tts-page-heading">
          <div>
            <span className="tts-eyebrow">
              LEARÑOVA • TEACHER SPACE
            </span>

            <h2>Review Submission</h2>

            <p>
              Check answers, award marks and provide feedback.
            </p>
          </div>

          <span className="tts-heading-icon">📝</span>
        </div>

        {error && (
          <div className="tts-alert tts-alert-error">
            {error}
          </div>
        )}

        {message && (
          <div className="tts-alert tts-alert-success">
            {message}
          </div>
        )}

        {/* STUDENT SUMMARY */}

        <div className="tts-detail-summary">

          <div>
            <span>Student</span>
            <strong>
              {student?.full_name || "Student"}
            </strong>
          </div>

          <div>
            <span>Test</span>
            <strong>{test.title}</strong>
          </div>

          <div>
            <span>Submitted</span>
            <strong>
              {formatDate(attempt.submitted_at)}
            </strong>
          </div>

          <div>
            <span>Total Questions</span>
            <strong>{questions.length}</strong>
          </div>

        </div>

        {/* RESULT SUMMARY */}

        <div className="tts-review-status">

          <div>
            <span>Objective marks</span>

            <strong>
              {attempt.objective_score ?? 0}
            </strong>
          </div>

          <div>
            <span>Written answers pending</span>

            <strong>
              {attempt.pending_review_count ?? 0}
            </strong>
          </div>

          <div>
            <span>Result</span>

            <strong>
              {attempt.results_released
                ? Number(attempt.pending_review_count) > 0
                  ? "Partial release"
                  : "Released"
                : "Not released"}
            </strong>
          </div>

        </div>

        {/* QUESTIONS */}

        <div className="tts-question-list">

          {questions.map((question, index) => {
            const response = question.response;

            const subjective = isSubjective(
              question.question_type
            );

            const draft =
              gradeDrafts[question.id] || {};

            return (
              <article
                className="tts-question-card"
                key={question.id}
              >

                {/* QUESTION HEADING */}

                <div className="tts-question-top">

                  <div>
                    <span className="tts-question-number">
                      QUESTION {index + 1}
                    </span>

                    <h3>{question.question_text}</h3>
                  </div>

                  <span className="tts-marks-pill">
                    {question.marks} marks
                  </span>

                </div>

                {/* STUDENT ANSWER */}

                <div className="tts-answer-box">

                  <span>STUDENT'S ANSWER</span>

                  <p>
                    {getAnswerText(
                      question,
                      response?.answer
                    )}
                  </p>

                </div>

                {/* OBJECTIVE QUESTION RESULT */}

                {!subjective && (
                  <div className="tts-correct-answer">

                    <span>CORRECT ANSWER</span>

                    <p>
                      {getCorrectAnswerText(
                        question,
                        question.answer_key
                      )}
                    </p>

                    <strong>
                      Awarded:{" "}
                      {response?.marks_awarded ?? 0} /{" "}
                      {question.marks}
                    </strong>

                    <span>
                      {response?.is_correct
                        ? "✓ Correct"
                        : "✗ Incorrect or unanswered"}
                    </span>

                  </div>
                )}

                {/* WRITTEN QUESTION CORRECTION */}

                {subjective && (
                  <div className="tts-manual-review">

                    <div className="tts-model-answer">

                      <span>
                        TEACHER'S MARKING GUIDE
                      </span>

                      <p>
                        {getCorrectAnswerText(
                          question,
                          question.answer_key
                        )}
                      </p>

                      {question.answer_key?.correct_answer?.keywords?.length > 0 && (
                        <p>
                          <strong>
                            Important keywords:
                          </strong>{" "}
                          {question.answer_key.correct_answer.keywords.join(", ")}
                        </p>
                      )}

                    </div>

                    {response ? (
                      <label>
                        Marks awarded (maximum {question.marks})

                        <input
                          type="number"
                          min="0"
                          max={question.marks}
                          step="0.5"
                          value={draft.marks_awarded ?? ""}
                          onChange={(event) =>
                            updateGrade(
                              question.id,
                              "marks_awarded",
                              event.target.value
                            )
                          }
                          placeholder="Enter marks"
                        />
                      </label>
                    ) : (
                      <div className="tts-unanswered">
                        Student did not answer this question.
                        Zero marks will be awarded.
                      </div>
                    )}

                  </div>
                )}

                {/* FEEDBACK FOR ALL ANSWERED QUESTIONS */}

                {response && (
                  <div className="tts-manual-review tts-feedback-section">

                    <label>
                      💬 Teacher Feedback for Question {index + 1}

                      <textarea
                        rows={4}
                        value={draft.teacher_feedback || ""}
                        onChange={(event) =>
                          updateGrade(
                            question.id,
                            "teacher_feedback",
                            event.target.value
                          )
                        }
                        placeholder="Write your explanation, correction or suggestions for the student..."
                      />

                    </label>

                    <small>
                      This feedback will be available to the
                      student when the result is released.
                    </small>

                  </div>
                )}

              </article>
            );
          })}

        </div>

        {/* SAVE AND RELEASE */}

        <div className="tts-review-actions">

          <div>
            <h3>Finish Review</h3>

            <p>
              {attempt.results_released
                ? "The result has been released."
                : test.result_release === "manual"
                  ? "Save corrections first, then release the result when ready."
                  : "Results will be released once all written answers have been corrected."}
            </p>
          </div>

          <div className="tts-action-buttons">

            <button
              type="button"
              className="tts-save-button"
              onClick={() => saveReview(false)}
              disabled={saving}
            >
              {saving
                ? "Saving..."
                : "Save Corrections"}
            </button>

            {test.result_release === "manual" &&
              canRelease && (
                <button
                  type="button"
                  className="tts-release-button"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Release this student's final result?"
                      )
                    ) {
                      saveReview(true);
                    }
                  }}
                  disabled={saving}
                >
                  Save & Release Result
                </button>
              )}

          </div>

        </div>

      </section>
    );
  }

  // ==========================================
  // SUBMISSIONS LIST PAGE
  // ==========================================

  return (
    <section className="teacher-test-submissions">

      {/* HEADER */}

      <div className="tts-page-heading">

        <div>
          <span className="tts-eyebrow">
            LEARÑOVA • TEACHER SPACE
          </span>

          <h2>📋 Test Submissions</h2>

          <p>
            View student attempts, correct written answers
            and release results.
          </p>
        </div>

        <span className="tts-heading-icon">📝</span>

      </div>

      {/* SUMMARY CARDS */}

      <div className="tts-summary-grid">

        <article>
          <span>📚</span>

          <div>
            <p>Total Submissions</p>
            <strong>{submissions.length}</strong>
          </div>
        </article>

        <article>
          <span>✏️</span>

          <div>
            <p>Awaiting Correction</p>
            <strong>{pendingCount}</strong>
          </div>
        </article>

        <article>
          <span>🎉</span>

          <div>
            <p>Results Released</p>
            <strong>{releasedCount}</strong>
          </div>
        </article>

      </div>

      {/* SUBMISSION TABLE */}

      <div className="tts-list-panel">

        <div className="tts-list-heading">

          <div>
            <h3>Student Attempts</h3>

            <p>
              All submitted examinations and practice tests.
            </p>
          </div>

          <button
            type="button"
            className="tts-refresh-button"
            onClick={loadSubmissions}
            disabled={loading}
          >
            ↻ Refresh
          </button>

        </div>

        {/* SEARCH AND FILTER */}

        <div className="tts-toolbar">

          <input
            type="search"
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            placeholder="Search student or test name..."
          />

          <select
            value={filter}
            onChange={(event) =>
              setFilter(event.target.value)
            }
          >
            <option value="all">
              All submissions
            </option>

            <option value="pending">
              Awaiting correction
            </option>

            <option value="unreleased">
              Results not released
            </option>

            <option value="released">
              Results released
            </option>

          </select>

        </div>

        {error && (
          <div className="tts-alert tts-alert-error">
            {error}
          </div>
        )}

        {loading ? (
          <p className="tts-empty">
            Loading submissions...
          </p>
        ) : filteredSubmissions.length === 0 ? (
          <div className="tts-empty">

            <span>🌸</span>

            <h3>No submissions found</h3>

            <p>
              Student submissions will appear here
              after they submit their tests.
            </p>

          </div>
        ) : (
          <div className="tts-table-wrap">

            <table className="tts-table">

              <thead>
                <tr>
                  <th>Student</th>
                  <th>Test</th>
                  <th>Submitted</th>
                  <th>Marks</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>

                {filteredSubmissions.map((item) => (
                  <tr key={item.id}>

                    <td>
                      <strong>
                        {item.student_name}
                      </strong>

                      <small>
                        Attempt {item.attempt_number}
                      </small>
                    </td>

                    <td>{item.test_title}</td>

                    <td>
                      {formatDate(item.submitted_at)}
                    </td>

                    <td>
                      {item.results_released
                        ? `${item.score ?? item.objective_score ?? 0} / ${item.total_marks}`
                        : item.objective_score !== null &&
                          item.objective_score !== undefined
                          ? `${item.objective_score} objective marks`
                          : "Pending"}
                    </td>

                    <td>
                      <span
                        className={`tts-status ${
                          item.results_released
                            ? "released"
                            : Number(item.pending_review_count) > 0
                              ? "pending"
                              : "waiting"
                        }`}
                      >
                        {getStatusLabel(item)}
                      </span>
                    </td>

                    <td>
                      <button
                        type="button"
                        className="tts-view-button"
                        onClick={() =>
                          openSubmission(item)
                        }
                      >
                        Review →
                      </button>
                    </td>

                  </tr>
                ))}

              </tbody>

            </table>

          </div>
        )}

      </div>

    </section>
  );
}

export default TeacherTestSubmissions;
