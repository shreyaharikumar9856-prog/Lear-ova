import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import StudentTestRunner from "./StudentTestRunner";
import "./StudentTests.css";

function getTestAvailability(test) {
  const now = Date.now();
  const start = test.scheduled_start
    ? new Date(test.scheduled_start).getTime()
    : null;
  const end = test.scheduled_end
    ? new Date(test.scheduled_end).getTime()
    : null;

  if (start && now < start) return "upcoming";
  if (end && now > end) return "expired";

  return "available";
}

function formatDate(value) {
  if (!value) return "Not scheduled";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";

  return date.toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: true,
  });
}

function StudentTests() {
  const [tests, setTests] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resultsLoading, setResultsLoading] = useState(true);
  const [resultsError, setResultsError] = useState("");
  const [error, setError] = useState("");
  const [selectedTest, setSelectedTest] = useState(null);
  const [runningTest, setRunningTest] = useState(null);

  useEffect(() => {
    loadStudentTests();
  }, []);

  async function loadStudentResults() {
    setResultsLoading(true);
    setResultsError("");

    try {
      const { data, error: functionError } =
        await supabase.functions.invoke("student-test-results");

      if (functionError) throw functionError;
      if (data?.error) throw new Error(data.error);

      setResults(Array.isArray(data?.results) ? data.results : []);
    } catch (err) {
      console.error("Student results loading error:", err);
      setResultsError(err.message || "Unable to load released results.");
      setResults([]);
    } finally {
      setResultsLoading(false);
    }
  }

  async function loadStudentTests() {
    setLoading(true);
    setError("");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user) throw new Error("Please log in again.");

      const { data: student, error: studentError } = await supabase
        .from("students")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (studentError) throw studentError;
      if (!student) {
        throw new Error("Your student profile could not be found.");
      }

      const [assignmentResult, subjectResult] = await Promise.all([
        supabase
          .from("test_assignments")
          .select("test_id, tests(*)")
          .eq("student_id", student.id),

        supabase
          .from("subjects")
          .select("id, subject_name"),
      ]);

      if (assignmentResult.error) throw assignmentResult.error;
      if (subjectResult.error) throw subjectResult.error;

      const assignedTests = (assignmentResult.data || [])
        .map((assignment) => {
          const test = Array.isArray(assignment.tests)
            ? assignment.tests[0]
            : assignment.tests;

          return test;
        })
        .filter((test) => test && test.status === "published");

      setTests(assignedTests);
      setSubjects(subjectResult.data || []);

      // Results load independently, so a results issue won't hide assigned tests.
      await loadStudentResults();
    } catch (err) {
      console.error("Student tests loading error:", err);
      setError(err.message || "Unable to load your tests.");
    } finally {
      setLoading(false);
    }
  }

  function getSubjectName(subjectId) {
    return (
      subjects.find(
        (subject) => String(subject.id) === String(subjectId)
      )?.subject_name || "Subject"
    );
  }

  const availableTests = tests.filter(
    (test) => getTestAvailability(test) === "available"
  );

  const upcomingTests = tests.filter(
    (test) => getTestAvailability(test) === "upcoming"
  );

  const expiredTests = tests.filter(
    (test) => getTestAvailability(test) === "expired"
  );

  const examinationTests = tests.filter(
    (test) => (test.assessment_type || "practice") === "exam"
  );

  const practiceTests = tests.filter(
    (test) => (test.assessment_type || "practice") === "practice"
  );

  function renderTestCard(test) {
    const availability = getTestAvailability(test);

    return (
      <article className="student-test-card" key={test.id}>
        <div className="student-test-card-top">
          <span className={`student-test-status ${availability}`}>
            {availability === "available"
              ? "Available"
              : availability === "upcoming"
              ? "Upcoming"
              : "Expired"}
          </span>

          <span className="student-test-icon">📝</span>
        </div>

        <h3>{test.title}</h3>

        <p className="student-test-subject">
          📚 {getSubjectName(test.subject_id)}
        </p>

        {test.description && (
          <p className="student-test-description">{test.description}</p>
        )}

        <div className="student-test-details">
          <span>
            ⏱{" "}
            {Number(test.duration_minutes) > 0
              ? `${test.duration_minutes} minutes`
              : "No time limit"}
          </span>

          <span>🏆 {test.total_marks} marks</span>
        </div>

        <p className="student-test-subject">
          {test.assessment_type === "exam"
            ? "📝 Examination Mode"
            : "📚 Practice Mode"}
        </p>

        <div className="student-test-schedule">
          <p>
            <strong>Starts:</strong> {formatDate(test.scheduled_start)}
          </p>
          <p>
            <strong>Ends:</strong> {formatDate(test.scheduled_end)}
          </p>
          <p>
            <strong>Teacher:</strong> {test.teacher_name || "Learnova Teacher"}
          </p>
        </div>

        <button
          type="button"
          className="student-test-details-button"
          onClick={() => setSelectedTest(test)}
        >
          View Test Details →
        </button>
      </article>
    );
  }

  function renderResultCard(result) {
    const feedbackItems = Array.isArray(result.teacher_feedback)
      ? result.teacher_feedback
      : [];

    return (
      <article className="student-result-card" key={result.id}>
        <div className="student-result-card-heading">
          <div>
            <h4>{result.test_title || "Assessment"}</h4>
            <p>Released: {formatDate(result.results_released_at)}</p>
          </div>
          <span className="student-result-released">Result released</span>
        </div>

        <div className="student-result-score-row">
          <div className="student-result-score">
            <span>Marks obtained</span>
            <strong>
              {result.score == null ? "—" : Number(result.score)}{" "}
              <small>
                / {result.total_marks == null ? "—" : Number(result.total_marks)}
              </small>
            </strong>
          </div>

          <div className="student-result-percentage">
            <span>Percentage</span>
            <strong>
              {result.percentage == null
                ? "Not available"
                : `${Number(result.percentage).toFixed(2)}%`}
            </strong>
          </div>
        </div>

        <p className="student-result-submitted">
          Submitted: {formatDate(result.submitted_at)}
        </p>

        {feedbackItems.length > 0 ? (
          <div className="student-result-feedback">
            <h5>Teacher's feedback</h5>
            {feedbackItems.map((item, index) => (
              <div
                className="student-result-feedback-item"
                key={`${result.id}-${item.question_order ?? index}-${index}`}
              >
                <p className="student-result-feedback-question">
                  {item.question_order != null
                    ? `Question ${item.question_order}`
                    : "Feedback"}
                  {item.question_text ? `: ${item.question_text}` : ""}
                </p>
                <p>{item.feedback}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="student-result-no-feedback">
            No individual feedback was added for this result.
          </p>
        )}
      </article>
    );
  }

  // Open test runner.
  if (runningTest) {
    return (
      <StudentTestRunner
        test={{
          ...runningTest,
          subject_name: getSubjectName(runningTest.subject_id),
        }}
        onBack={() => {
          setRunningTest(null);
          setSelectedTest(null);
          loadStudentTests();
        }}
        onSubmitted={() => {
          loadStudentTests();
        }}
      />
    );
  }

  if (loading) {
    return (
      <section className="student-tests-page">
        <p className="student-tests-loading">Loading your tests... 🌷</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="student-tests-page">
        <div className="student-tests-error">
          <h3>Unable to load your tests</h3>
          <p>{error}</p>
          <button type="button" onClick={loadStudentTests}>
            Try Again
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="student-tests-page">
      <div className="student-tests-header">
        <div>
          <span className="student-tests-eyebrow">
            LEARÑOVA • YOUR LEARNING SPACE
          </span>
          <h2>📝 My Tests</h2>
          <p>Your examinations, assessments and results, all in one place.</p>
        </div>
        <div className="student-tests-header-icon">🎓</div>
      </div>

      <div className="student-tests-summary">
        <div>
          <span>Available</span>
          <strong>{availableTests.length}</strong>
        </div>
        <div>
          <span>Upcoming</span>
          <strong>{upcomingTests.length}</strong>
        </div>
        <div>
          <span>Expired</span>
          <strong>{expiredTests.length}</strong>
        </div>
      </div>

      {/* Released results */}
      <div className="student-tests-section student-results-section">
        <div className="student-tests-section-heading">
          <div>
            <h3>🏅 My Results</h3>
            <p className="student-results-intro">
              Your marks and feedback from your teacher.
            </p>
          </div>
          <span>{results.length}</span>
        </div>

        {resultsLoading ? (
          <div className="student-tests-empty">
            <p>Loading your released results...</p>
          </div>
        ) : resultsError ? (
          <div className="student-results-error">
            <p>{resultsError}</p>
            <button type="button" onClick={loadStudentResults}>
              Try Again
            </button>
          </div>
        ) : results.length > 0 ? (
          <div className="student-results-list">
            {results.map(renderResultCard)}
          </div>
        ) : (
          <div className="student-tests-empty">
            <span>📋</span>
            <p>No results have been released yet.</p>
            <small>
              Once your teacher releases a result, it will appear here.
            </small>
          </div>
        )}
      </div>

      {selectedTest && (
        <div className="student-test-detail-panel">
          <button
            type="button"
            className="student-test-close"
            onClick={() => setSelectedTest(null)}
            aria-label="Close test details"
          >
            ✕
          </button>

          <h3>{selectedTest.title}</h3>
          <p>{selectedTest.description || "No description provided."}</p>
          <p>
            <strong>Subject:</strong>{" "}
            {getSubjectName(selectedTest.subject_id)}
          </p>
          <p>
            <strong>Duration:</strong>{" "}
            {Number(selectedTest.duration_minutes) > 0
              ? `${selectedTest.duration_minutes} minutes`
              : "No time limit"}
          </p>
          <p>
            <strong>Assessment Type:</strong>{" "}
            {selectedTest.assessment_type === "exam"
              ? "Examination Mode"
              : "Practice Mode"}
          </p>
          <p>
            <strong>Total marks:</strong> {selectedTest.total_marks}
          </p>
          <p>
            <strong>Delivery Method:</strong> {selectedTest.test_mode}
          </p>
          <p>
            <strong>Availability:</strong>{" "}
            {getTestAvailability(selectedTest)}
          </p>

          {getTestAvailability(selectedTest) === "available" ? (
            <div>
              <p className="student-test-next-step">
                Your test is ready. Good luck! 🌸
              </p>
              <button
                type="button"
                className="student-test-details-button"
                onClick={() => setRunningTest(selectedTest)}
              >
                {selectedTest.assessment_type === "exam"
                  ? "Start Examination →"
                  : "Start Practice →"}
              </button>
            </div>
          ) : (
            <p className="student-test-next-step">
              {getTestAvailability(selectedTest) === "upcoming"
                ? "This test is not open yet. Come back at the scheduled start time."
                : "The scheduled time for this test has ended."}
            </p>
          )}
        </div>
      )}

      {/* Examinations */}
      <div className="student-tests-section">
        <div className="student-tests-section-heading">
          <h3>📝 Examinations</h3>
          <span>{examinationTests.length}</span>
        </div>

        {examinationTests.length > 0 ? (
          <div className="student-tests-grid">
            {examinationTests.map(renderTestCard)}
          </div>
        ) : (
          <div className="student-tests-empty">
            <span>📝</span>
            <p>No examinations assigned yet.</p>
          </div>
        )}
      </div>

      {/* Practice tests */}
      <div className="student-tests-section">
        <div className="student-tests-section-heading">
          <h3>📚 Practice Tests</h3>
          <span>{practiceTests.length}</span>
        </div>

        {practiceTests.length > 0 ? (
          <div className="student-tests-grid">
            {practiceTests.map(renderTestCard)}
          </div>
        ) : (
          <div className="student-tests-empty">
            <span>🌸</span>
            <p>No practice tests assigned yet.</p>
          </div>
        )}
      </div>

      <button
        type="button"
        className="student-tests-refresh"
        onClick={loadStudentTests}
      >
        ↻ Refresh Tests & Results
      </button>
    </section>
  );
}

export default StudentTests;
