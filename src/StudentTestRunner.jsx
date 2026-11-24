import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabaseClient";

function StudentTestRunner({ test, onBack, onSubmitted }) {
  const isExam = test?.assessment_type === "exam";

  const [starting, setStarting] = useState(false);
  const [attempt, setAttempt] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);

  const [secondsLeft, setSecondsLeft] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  // Image upload state
  const [uploadingImages, setUploadingImages] = useState({});
  const [imagePreviewUrls, setImagePreviewUrls] = useState({});
  const [questionImageUrls, setQuestionImageUrls] = useState({});
  const [questionImageErrors, setQuestionImageErrors] = useState({});

  const answersRef = useRef({});
  const saveTimersRef = useRef({});
  const savePromisesRef = useRef({});
  const dirtyAnswersRef = useRef(new Set());

  const uploadPromisesRef = useRef({});

  const submitStartedRef = useRef(false);

  const currentQuestion = questions[currentIndex];

  const BUCKET_NAME = "test-materials";
  const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

  // ==========================================
  // HELPER FUNCTIONS
  // ==========================================

  function isWrittenQuestion(question) {
    return [
      "short_answer",
      "long_answer",
      "diagram_label",
    ].includes(question.question_type);
  }

  function isAnswered(question, answer) {
    if (!answer) return false;

    switch (question.question_type) {
      case "mcq":
        return Boolean(answer.option_id);

      case "multiple_select":
        return Array.isArray(answer.option_ids) &&
          answer.option_ids.length > 0;

      case "true_false":
        return typeof answer.value === "boolean";

      case "matching": {
        const pairs = question.options?.pairs || [];
        const selected = answer.pairs || {};

        return pairs.length > 0 &&
          pairs.every((pair) =>
            Boolean(selected[pair.left])
          );
      }

      case "ordering":
        return Boolean(answer.text?.trim());

      default:
        return Boolean(
          answer.text?.trim() ||
          (
            isWrittenQuestion(question) &&
            answer.image_paths?.length > 0
          )
        );
    }
  }

  function getAnsweredCount() {
    return questions.filter((question) =>
      isAnswered(question, answers[question.id])
    ).length;
  }

  function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    return `${String(minutes).padStart(2, "0")}:${String(
      remainingSeconds
    ).padStart(2, "0")}`;
  }

  async function getImagePreviewUrl(path) {
    const { data, error: urlError } =
      await supabase.storage
        .from(BUCKET_NAME)
        .createSignedUrl(path, 60 * 60);

    if (urlError) throw urlError;

    return data.signedUrl;
  }

  async function loadImagePreviews(savedAnswers) {
    const previews = {};

    for (const [questionId, answer] of Object.entries(savedAnswers)) {
      const paths = answer?.image_paths || [];

      for (const path of paths) {
        try {
          const url = await getImagePreviewUrl(path);

          previews[path] = url;
        } catch (err) {
          console.error("Could not load image preview:", err);
        }
      }
    }

    setImagePreviewUrls(previews);
  }

  async function loadQuestionImagePreviews(questionData) {
    const previews = {};
    const failed = {};

    for (const question of questionData || []) {
      const imagePath = question.settings?.question_image_path;

      if (!imagePath) continue;

      try {
        const url = await getImagePreviewUrl(imagePath);
        previews[question.id] = url;
      } catch (err) {
        // Keep the test usable even if one optional image cannot be loaded.
        failed[question.id] = true;
        console.error(
          `Could not load the image for question ${question.question_order}:`,
          err
        );
      }
    }

    setQuestionImageUrls(previews);
    setQuestionImageErrors(failed);
  }

  // ==========================================
  // START TEST
  // ==========================================

  async function startTest() {
    if (starting || attempt) return;

    setStarting(true);
    setError("");
    setStatusMessage("");

    try {
      const { data, error: startError } =
        await supabase.functions.invoke(
          "start-test-attempt",
          {
            body: {
              test_id: test.id,
            },
          }
        );

      if (startError) throw startError;

      const newAttempt =
        data?.attempt ||
        data?.data?.attempt ||
        data;

      if (!newAttempt?.id) {
        throw new Error(
          data?.error || "Unable to start this test."
        );
      }

      // Load questions without loading answer keys.
      const { data: questionData, error: questionError } =
        await supabase
          .from("test_questions")
          .select(`
            id,
            question_type,
            question_text,
            options,
            marks,
            negative_marks,
            question_order,
            settings
          `)
          .eq("test_id", test.id)
          .order("question_order", {
            ascending: true,
          });

      if (questionError) throw questionError;

      if (!questionData?.length) {
        throw new Error(
          "This test does not contain any questions."
        );
      }

      let previousAnswers = {};

      // Practice attempts may be resumed.
      if (!isExam) {
        const { data: responseData, error: responseError } =
          await supabase
            .from("test_responses")
            .select("question_id, answer")
            .eq("attempt_id", newAttempt.id);

        if (responseError) throw responseError;

        (responseData || []).forEach((response) => {
          previousAnswers[response.question_id] =
            response.answer;
        });
      }

      setAttempt(newAttempt);
      setQuestions(questionData);
      setAnswers(previousAnswers);

      answersRef.current = previousAnswers;

      // Load student answer previews and teacher-provided question images.
      // A question image preview failure must not prevent the student
      // from starting or completing the test.
      await Promise.all([
        loadImagePreviews(previousAnswers),
        loadQuestionImagePreviews(questionData),
      ]);

      if (newAttempt.deadline_at) {
        const remaining = Math.max(
          0,
          Math.ceil(
            (
              new Date(newAttempt.deadline_at).getTime() -
              Date.now()
            ) / 1000
          )
        );

        setSecondsLeft(remaining);
      }

    } catch (err) {
      console.error("Starting test failed:", err);

      setError(
        err.message ||
        "Unable to start the test. Please try again."
      );

    } finally {
      setStarting(false);
    }
  }

  // ==========================================
  // SAVE ANSWER
  // ==========================================

  async function saveAnswer(questionId, answer) {
    if (!attempt?.id) return;

    const request = (async () => {
      const { error: saveError } =
        await supabase.functions.invoke(
          "save-test-response",
          {
            body: {
              attempt_id: attempt.id,
              question_id: questionId,
              answer,
            },
          }
        );

      if (saveError) throw saveError;
    })();

    savePromisesRef.current[questionId] = request;

    setSaving(true);

    try {
      await request;

      const latestAnswer =
        answersRef.current[questionId];

      if (
        JSON.stringify(latestAnswer) ===
        JSON.stringify(answer)
      ) {
        dirtyAnswersRef.current.delete(questionId);
      }

    } finally {
      if (
        savePromisesRef.current[questionId] === request
      ) {
        delete savePromisesRef.current[questionId];
      }

      setSaving(
        Object.keys(savePromisesRef.current).length > 0
      );
    }
  }

  function handleAnswerChange(questionId, answer) {
    const updatedAnswers = {
      ...answersRef.current,
      [questionId]: answer,
    };

    answersRef.current = updatedAnswers;
    setAnswers(updatedAnswers);

    dirtyAnswersRef.current.add(questionId);

    // Debounce saves while students type.
    if (saveTimersRef.current[questionId]) {
      clearTimeout(saveTimersRef.current[questionId]);
    }

    saveTimersRef.current[questionId] = setTimeout(() => {
      delete saveTimersRef.current[questionId];

      saveAnswer(questionId, answer).catch((err) => {
        console.error("Answer saving failed:", err);
        setError(
          "An answer could not be saved. Please check your connection."
        );
      });
    }, 600);
  }

  // ==========================================
  // STUDENT IMAGE UPLOAD
  // ==========================================

  async function uploadAnswerImages(question, files) {
    if (!attempt?.id || !question || !files?.length) return;

    const questionId = question.id;

    const uploadTask = (async () => {
      setError("");

      try {
        const { data: userData, error: userError } =
          await supabase.auth.getUser();

        if (userError) throw userError;

        const user = userData?.user;

        if (!user) {
          throw new Error(
            "Your session has expired. Please sign in again."
          );
        }

        setUploadingImages((previous) => ({
          ...previous,
          [questionId]: true,
        }));

        const uploadedPaths = [];

        for (const file of files) {
          if (!file.type.startsWith("image/")) {
            throw new Error(
              "Please select image files only."
            );
          }

          if (file.size > MAX_IMAGE_SIZE) {
            throw new Error(
              `${file.name} is larger than 5 MB. Please choose a smaller image.`
            );
          }

          const safeName = file.name.replace(
            /[^a-zA-Z0-9._-]/g,
            "_"
          );

          const uniqueName =
            `${crypto.randomUUID()}-${safeName}`;

          // The first folder is the authenticated user's ID.
          const storagePath =
            `${user.id}/${attempt.id}/${questionId}/${uniqueName}`;

          const { error: uploadError } =
            await supabase.storage
              .from(BUCKET_NAME)
              .upload(storagePath, file, {
                contentType: file.type,
                upsert: false,
              });

          if (uploadError) throw uploadError;

          uploadedPaths.push(storagePath);

          try {
            const previewUrl =
              await getImagePreviewUrl(storagePath);

            setImagePreviewUrls((previous) => ({
              ...previous,
              [storagePath]: previewUrl,
            }));
          } catch (previewError) {
            console.error(
              "Image uploaded but preview could not be created:",
              previewError
            );
          }
        }

        // Always use the latest answer to avoid overwriting typed text.
        const latestAnswer =
          answersRef.current[questionId] || {};

        const existingPaths =
          latestAnswer.image_paths || [];

        const updatedAnswer = {
          ...latestAnswer,
          image_paths: [
            ...existingPaths,
            ...uploadedPaths,
          ],
        };

        handleAnswerChange(questionId, updatedAnswer);

      } catch (err) {
        console.error("Image upload failed:", err);

        setError(
          err.message ||
          "Unable to upload the image. Please try again."
        );

      } finally {
        setUploadingImages((previous) => ({
          ...previous,
          [questionId]: false,
        }));
      }
    })();

    uploadPromisesRef.current[questionId] = uploadTask;

    try {
      await uploadTask;
    } finally {
      if (
        uploadPromisesRef.current[questionId] === uploadTask
      ) {
        delete uploadPromisesRef.current[questionId];
      }
    }
  }

  async function removeAnswerImage(questionId, path) {
    if (!attempt?.id) return;

    const confirmed = window.confirm(
      "Are you sure you want to remove this image?"
    );

    if (!confirmed) return;

    try {
      setError("");

      const { error: removeError } =
        await supabase.storage
          .from(BUCKET_NAME)
          .remove([path]);

      if (removeError) throw removeError;

      const latestAnswer =
        answersRef.current[questionId] || {};

      const updatedPaths =
        (latestAnswer.image_paths || []).filter(
          (item) => item !== path
        );

      const updatedAnswer = {
        ...latestAnswer,
        image_paths: updatedPaths,
      };

      setImagePreviewUrls((previous) => {
        const updated = { ...previous };
        delete updated[path];
        return updated;
      });

      handleAnswerChange(questionId, updatedAnswer);

    } catch (err) {
      console.error("Image removal failed:", err);

      setError(
        err.message ||
        "Unable to remove this image. Please try again."
      );
    }
  }

  function renderAnswerImageSection(question) {
    if (!isWrittenQuestion(question)) return null;

    const answer = answers[question.id] || {};
    const imagePaths = answer.image_paths || [];
    const isUploading = Boolean(
      uploadingImages[question.id]
    );

    return (
      <div className="runner-image-upload-section">
        <label className="runner-image-upload-label">
          Attach images of your answer
        </label>

        <p className="runner-image-upload-hint">
          You can upload photos of handwritten answers,
          diagrams, or working. Maximum 5 MB per image.
        </p>

        <label
          className={[
            "runner-image-upload-button",
            isUploading ? "uploading" : "",
          ].join(" ")}
        >
          {isUploading
            ? "Uploading image..."
            : "+ Add image"}

          <input
            type="file"
            accept="image/*"
            multiple
            disabled={isUploading || submitting}
            onChange={(event) => {
              const selectedFiles = Array.from(
                event.target.files || []
              );

              uploadAnswerImages(
                question,
                selectedFiles
              );

              // Allows selecting the same image again if needed.
              event.target.value = "";
            }}
          />
        </label>

        {imagePaths.length > 0 && (
          <div className="runner-image-preview-grid">
            {imagePaths.map((path) => (
              <div
                className="runner-image-preview-item"
                key={path}
              >
                {imagePreviewUrls[path] ? (
                  <img
                    src={imagePreviewUrls[path]}
                    alt="Uploaded answer"
                  />
                ) : (
                  <div className="runner-image-loading">
                    Loading image...
                  </div>
                )}

                <button
                  type="button"
                  onClick={() =>
                    removeAnswerImage(question.id, path)
                  }
                  disabled={submitting || isUploading}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ==========================================
  // SAVE ALL PENDING ANSWERS
  // ==========================================

  async function flushPendingAnswers() {
    const questionIds = [
      ...dirtyAnswersRef.current,
    ];

    for (const questionId of questionIds) {
      if (saveTimersRef.current[questionId]) {
        clearTimeout(saveTimersRef.current[questionId]);
        delete saveTimersRef.current[questionId];
      }

      const previousRequest =
        savePromisesRef.current[questionId];

      if (previousRequest) {
        try {
          await previousRequest;
        } catch {
          // Retry below using the latest answer.
        }
      }

      if (dirtyAnswersRef.current.has(questionId)) {
        const latestAnswer =
          answersRef.current[questionId];

        await saveAnswer(questionId, latestAnswer);
      }
    }
  }

  // ==========================================
  // SUBMIT TEST
  // ==========================================

  async function submitTest(trigger = "manual") {
    if (submitStartedRef.current || submitted) return;

    const answeredCount = getAnsweredCount();
    const unansweredCount =
      questions.length - answeredCount;

    if (
      isExam &&
      trigger === "manual" &&
      unansweredCount > 0
    ) {
      setError(
        `You still have ${unansweredCount} unanswered question(s). Please answer all questions before submitting.`
      );
      return;
    }

    if (
      !window.confirm(
        trigger === "manual"
          ? "Are you sure you want to submit your test?"
          : "Your test is being submitted automatically."
      ) &&
      trigger === "manual"
    ) {
      return;
    }

    submitStartedRef.current = true;
    setSubmitting(true);
    setError("");

    try {
      // Wait for image uploads to finish before saving answers.
      await Promise.all(
        Object.values(uploadPromisesRef.current)
      );

      await flushPendingAnswers();

      const { data, error: submitError } =
        await supabase.functions.invoke(
          "submit-test-attempt",
          {
            body: {
              attempt_id: attempt.id,
              trigger,
            },
          }
        );

      if (submitError) throw submitError;

      if (data?.error) {
        throw new Error(data.error);
      }

      setSubmitted(true);
      setStatusMessage(
        "Your submission was saved. Grading is processing..."
      );

      // Run automatic grading.
      try {
        const { data: gradingData, error: gradingError } =
          await supabase.functions.invoke(
            "grade-test-attempt",
            {
              body: {
                attempt_id: attempt.id,
              },
            }
          );

        if (gradingError) {
          console.error(
            "Automatic grading invocation failed:",
            gradingError
          );

          setStatusMessage(
            "Your submission was saved. Automatic grading needs to be retried."
          );

        } else if (
          gradingData?.success === false ||
          gradingData?.error
        ) {
          console.error(
            "Automatic grading did not complete:",
            gradingData
          );

          setStatusMessage(
            "Your submission was saved. Automatic grading needs to be retried."
          );

        } else {
          setStatusMessage(
            "Your submission was saved. Grading has been processed."
          );
        }

      } catch (gradingErr) {
        console.error(
          "Automatic grading failed after submission:",
          gradingErr
        );

        setStatusMessage(
          "Your submission was saved. Automatic grading needs to be retried."
        );
      }

      if (onSubmitted) {
        onSubmitted(data);
      }

    } catch (err) {
      console.error("Test submission failed:", err);

      setError(
        err.message ||
        "Unable to submit your test. Please try again."
      );

      submitStartedRef.current = false;

    } finally {
      setSubmitting(false);
    }
  }

  // ==========================================
  // EXAMINATION COUNTDOWN
  // ==========================================

  useEffect(() => {
    if (!attempt?.deadline_at || submitted) {
      return;
    }

    const updateTimer = () => {
      const remaining = Math.max(
        0,
        Math.ceil(
          (
            new Date(attempt.deadline_at).getTime() -
            Date.now()
          ) / 1000
        )
      );

      setSecondsLeft(remaining);

      if (
        remaining === 0 &&
        !submitStartedRef.current
      ) {
        submitTest("time_expired");
      }
    };

    updateTimer();

    const timer = setInterval(updateTimer, 1000);

    return () => clearInterval(timer);
  }, [attempt?.id, attempt?.deadline_at, submitted]);

  // ==========================================
  // AUTO-SUBMIT WHEN STUDENT SWITCHES TAB
  // ==========================================

  useEffect(() => {
    if (!attempt?.id || !isExam || submitted) {
      return;
    }

    function handleVisibilityChange() {
      if (
        document.visibilityState === "hidden" &&
        !submitStartedRef.current
      ) {
        submitTest("tab_switch");
      }
    }

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );

    return () => {
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
    };
  }, [attempt?.id, submitted]);

  // ==========================================
  // CLEAN UP PENDING SAVE TIMERS
  // ==========================================

  useEffect(() => {
    return () => {
      Object.values(saveTimersRef.current).forEach(
        clearTimeout
      );
    };
  }, []);

  // ==========================================
  // QUESTION INPUTS
  // ==========================================

  function renderQuestionInput(question) {
    const answer = answers[question.id] || {};

    const update = (newAnswer) =>
      handleAnswerChange(question.id, newAnswer);

    switch (question.question_type) {
      case "mcq": {
        const options = Array.isArray(question.options)
          ? question.options
          : [];

        return (
          <div className="runner-options">
            {options.map((option) => (
              <label
                key={option.id}
                className="runner-option"
              >
                <input
                  type="radio"
                  name={`question-${question.id}`}
                  checked={
                    answer.option_id === option.id
                  }
                  onChange={() =>
                    update({
                      option_id: option.id,
                    })
                  }
                />

                <span>
                  <strong>{option.id}.</strong>{" "}
                  {option.text}
                </span>
              </label>
            ))}
          </div>
        );
      }

      case "multiple_select": {
        const options = Array.isArray(question.options)
          ? question.options
          : [];

        const selected = answer.option_ids || [];

        return (
          <div className="runner-options">
            <p className="runner-hint">
              Select all correct answers.
            </p>

            {options.map((option) => (
              <label
                key={option.id}
                className="runner-option"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(option.id)}
                  onChange={() => {
                    const updated = selected.includes(option.id)
                      ? selected.filter(
                          (id) => id !== option.id
                        )
                      : [...selected, option.id];

                    update({
                      option_ids: updated,
                    });
                  }}
                />

                <span>
                  <strong>{option.id}.</strong>{" "}
                  {option.text}
                </span>
              </label>
            ))}
          </div>
        );
      }

      case "true_false":
        return (
          <div className="runner-options">
            {[
              { value: true, label: "True" },
              { value: false, label: "False" },
            ].map((option) => (
              <label
                key={option.label}
                className="runner-option"
              >
                <input
                  type="radio"
                  name={`question-${question.id}`}
                  checked={answer.value === option.value}
                  onChange={() =>
                    update({ value: option.value })
                  }
                />

                {option.label}
              </label>
            ))}
          </div>
        );

      case "matching": {
        const pairs = question.options?.pairs || [];
        const selected = answer.pairs || {};

        return (
          <div className="runner-matching">
            {pairs.map((pair, index) => (
              <div
                className="runner-matching-row"
                key={index}
              >
                <strong>{pair.left}</strong>

                <select
                  value={selected[pair.left] || ""}
                  onChange={(event) =>
                    update({
                      pairs: {
                        ...selected,
                        [pair.left]: event.target.value,
                      },
                    })
                  }
                >
                  <option value="">
                    Choose an answer
                  </option>

                  {pairs.map((item, optionIndex) => (
                    <option
                      key={optionIndex}
                      value={item.right}
                    >
                      {item.right}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        );
      }

      case "ordering": {
        const items = question.options?.items || [];

        return (
          <div>
            <p className="runner-hint">
              Enter the items in the correct order,
              one per line.
            </p>

            <textarea
              className="runner-textarea"
              rows={Math.max(4, items.length)}
              value={answer.text || ""}
              onChange={(event) =>
                update({
                  text: event.target.value,
                })
              }
              placeholder="Enter the correct sequence..."
            />
          </div>
        );
      }

      case "fill_blank":
      case "one_word":
        return (
          <input
            className="runner-text-input"
            type="text"
            value={answer.text || ""}
            onChange={(event) =>
              update({
                text: event.target.value,
              })
            }
            placeholder="Type your answer..."
          />
        );

      case "short_answer":
      case "long_answer":
      case "diagram_label":
      default:
        return (
          <textarea
            className="runner-textarea"
            rows={
              question.question_type === "long_answer"
                ? 7
                : 4
            }
            value={answer.text || ""}
            onChange={(event) =>
              update({
                text: event.target.value,
              })
            }
            placeholder="Write your answer here..."
          />
        );
    }
  }

  // ==========================================
  // START SCREEN
  // ==========================================

  if (!attempt) {
    return (
      <section className="student-runner-page">
        <div className="runner-header">
          <button
            type="button"
            onClick={onBack}
            className="runner-back-button"
          >
            ← Back to tests
          </button>

          <h2>{test.title}</h2>
        </div>

        <div className="runner-start-card">
          <h3>
            {isExam
              ? "📝 Examination Mode"
              : "📚 Practice Mode"}
          </h3>

          <p>{test.description || "Get ready to begin."}</p>

          <div className="runner-info">
            <p>
              <strong>Subject:</strong>{" "}
              {test.subject_name || "Your assigned subject"}
            </p>

            <p>
              <strong>Duration:</strong>{" "}
              {Number(test.duration_minutes) > 0
                ? `${test.duration_minutes} minutes`
                : "No time limit"}
            </p>

            <p>
              <strong>Total Marks:</strong>{" "}
              {test.total_marks}
            </p>

            <p>
              <strong>Question Navigation:</strong>{" "}
              You can move between questions.
            </p>
          </div>

          {isExam && (
            <div className="runner-warning">
              Examination rules apply. Switching away
              from the test page or reaching the deadline
              will trigger automatic submission.
              You cannot resume an examination attempt.
            </div>
          )}

          {!isExam && (
            <div className="runner-practice-note">
              Practice Mode allows you to leave and
              resume an unfinished attempt.
            </div>
          )}

          {error && (
            <p className="runner-error">{error}</p>
          )}

          <button
            type="button"
            className="runner-primary-button"
            onClick={startTest}
            disabled={starting}
          >
            {starting
              ? "Starting..."
              : isExam
              ? "Start Examination"
              : "Start Practice"}
          </button>
        </div>
      </section>
    );
  }

  // ==========================================
  // SUBMITTED SCREEN
  // ==========================================

  if (submitted) {
    return (
      <section className="student-runner-page">
        <div className="runner-submitted-card">
          <div className="runner-success-icon">✓</div>

          <h2>Test Submitted!</h2>

          <p>{statusMessage}</p>

          <p>
            Answered: {getAnsweredCount()} /{" "}
            {questions.length}
          </p>

          <button
            type="button"
            className="runner-primary-button"
            onClick={onBack}
          >
            Back to My Tests
          </button>
        </div>
      </section>
    );
  }

  // ==========================================
  // TEST SCREEN
  // ==========================================

  return (
    <section className="student-runner-page">
      <header className="runner-header">
        <div>
          <span className="runner-eyebrow">
            {isExam
              ? "EXAMINATION"
              : "PRACTICE SESSION"}
          </span>

          <h2>{test.title}</h2>
        </div>

        {attempt.deadline_at && secondsLeft !== null && (
          <div className="runner-timer">
            <span>Time Remaining</span>
            <strong>{formatTime(secondsLeft)}</strong>
          </div>
        )}
      </header>

      <div className="runner-progress">
        <span>
          Answered {getAnsweredCount()} of {questions.length}
        </span>

        <div className="runner-progress-track">
          <div
            className="runner-progress-fill"
            style={{
              width: `${
                (getAnsweredCount() / questions.length) * 100
              }%`,
            }}
          />
        </div>
      </div>

      {error && (
        <div className="runner-error">
          {error}
        </div>
      )}

      <div className="runner-layout">
        <main className="runner-question-card">
          {currentQuestion && (
            <>
              <div className="runner-question-heading">
                <span>
                  Question {currentIndex + 1} of{" "}
                  {questions.length}
                </span>

                <span>
                  {currentQuestion.marks} marks
                </span>
              </div>

              <h3>{currentQuestion.question_text}</h3>

              {questionImageUrls[currentQuestion.id] && (
                <div className="runner-question-image">
                  <img
                    src={questionImageUrls[currentQuestion.id]}
                    alt={`Image for question ${currentIndex + 1}`}
                  />
                </div>
              )}

              {questionImageErrors[currentQuestion.id] && (
                <p className="runner-hint">
                  The question image could not be loaded. Please inform your teacher.
                </p>
              )}

              <div className="runner-answer-area">
                {renderQuestionInput(currentQuestion)}

                {renderAnswerImageSection(currentQuestion)}
              </div>

              <div className="runner-navigation">
                <button
                  type="button"
                  onClick={() =>
                    setCurrentIndex((index) =>
                      Math.max(0, index - 1)
                    )
                  }
                  disabled={currentIndex === 0}
                >
                  ← Previous
                </button>

                {currentIndex < questions.length - 1 ? (
                  <button
                    type="button"
                    onClick={() =>
                      setCurrentIndex((index) =>
                        Math.min(
                          questions.length - 1,
                          index + 1
                        )
                      )
                    }
                  >
                    Next →
                  </button>
                ) : (
                  <span className="runner-last-question">
                    Last question
                  </span>
                )}
              </div>
            </>
          )}
        </main>

        <aside className="runner-question-sidebar">
          <h4>Questions</h4>

          <div className="runner-question-grid">
            {questions.map((question, index) => (
              <button
                type="button"
                key={question.id}
                className={[
                  "runner-question-number",
                  currentIndex === index ? "active" : "",
                  isAnswered(question, answers[question.id])
                    ? "answered"
                    : "",
                ].join(" ")}
                onClick={() => setCurrentIndex(index)}
              >
                {index + 1}
              </button>
            ))}
          </div>

          <div className="runner-save-status">
            {saving
              ? "Saving answers..."
              : "✓ Answers are saved automatically"}
          </div>

          <button
            type="button"
            className="runner-submit-button"
            onClick={() => submitTest("manual")}
            disabled={
              submitting ||
              saving ||
              Object.values(uploadingImages).some(Boolean)
            }
          >
            {submitting
              ? "Submitting..."
              : "Submit Test"}
          </button>

          {isExam && (
            <p className="runner-sidebar-note">
              All questions must be answered before
              manual submission.
            </p>
          )}

          {!isExam && (
            <p className="runner-sidebar-note">
              You can submit your practice test at any time.
            </p>
          )}
        </aside>
      </div>

      <style>{`
        .student-runner-page {
          width: 100%;
          padding: 24px;
          box-sizing: border-box;
          color: #40364b;
        }

        .runner-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 20px;
          margin-bottom: 24px;
          flex-wrap: wrap;
        }

        .runner-header h2 {
          margin: 8px 0;
          font-size: 26px;
        }

        .runner-eyebrow {
          color: #a16b99;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 1.5px;
        }

        .runner-back-button {
          border: 0;
          background: #f4eaf5;
          color: #725278;
          padding: 10px 15px;
          border-radius: 10px;
          cursor: pointer;
        }

        .runner-timer {
          background: #fff0f1;
          color: #a13f55;
          border-radius: 14px;
          padding: 12px 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .runner-timer strong {
          font-size: 25px;
          margin-top: 4px;
        }

        .runner-progress {
          margin-bottom: 22px;
        }

        .runner-progress-track {
          margin-top: 8px;
          width: 100%;
          height: 9px;
          background: #eee8f1;
          border-radius: 20px;
          overflow: hidden;
        }

        .runner-progress-fill {
          height: 100%;
          background: #b990c5;
          transition: width 0.2s;
        }

        .runner-layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 250px;
          gap: 20px;
          align-items: start;
        }

        .runner-question-card,
        .runner-question-sidebar,
        .runner-start-card,
        .runner-submitted-card {
          background: white;
          border: 1px solid #eee4f0;
          border-radius: 18px;
          padding: 24px;
          box-shadow: 0 5px 20px rgba(80, 50, 90, 0.05);
        }

        .runner-question-heading {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          color: #95739d;
          font-size: 13px;
          font-weight: 700;
          margin-bottom: 20px;
        }

        .runner-question-card h3 {
          font-size: 19px;
          line-height: 1.6;
          margin-bottom: 24px;
        }

        .runner-question-image {
          width: 100%;
          margin: 0 0 22px;
          padding: 12px;
          box-sizing: border-box;
          display: flex;
          justify-content: center;
          align-items: center;
          background: #fcf9fd;
          border: 1px solid #eadfec;
          border-radius: 13px;
        }

        .runner-question-image img {
          display: block;
          max-width: 100%;
          max-height: 420px;
          width: auto;
          height: auto;
          object-fit: contain;
          border-radius: 8px;
        }

        .runner-option {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px;
          margin-bottom: 10px;
          border: 1px solid #eadfec;
          border-radius: 12px;
          cursor: pointer;
        }

        .runner-option input {
          accent-color: #9b74a7;
        }

        .runner-hint {
          color: #8d7793;
          font-size: 13px;
        }

        .runner-text-input,
        .runner-textarea,
        .runner-matching select {
          width: 100%;
          box-sizing: border-box;
          padding: 13px;
          border: 1px solid #e3d6e8;
          border-radius: 10px;
          font: inherit;
          background: #fff;
          color: #40364b;
        }

        .runner-textarea {
          resize: vertical;
          min-height: 100px;
        }

        .runner-matching-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          align-items: center;
          gap: 15px;
          margin-bottom: 13px;
        }

        /* Student image upload */

        .runner-image-upload-section {
          margin-top: 22px;
          padding: 17px;
          border: 1px dashed #d9c5df;
          border-radius: 13px;
          background: #fcf9fd;
        }

        .runner-image-upload-label {
          display: block;
          font-weight: 700;
          font-size: 14px;
          color: #654b70;
          margin-bottom: 6px;
        }

        .runner-image-upload-hint {
          font-size: 12px;
          line-height: 1.5;
          color: #927a99;
          margin: 0 0 13px;
        }

        .runner-image-upload-button {
          display: inline-block;
          padding: 10px 15px;
          border-radius: 9px;
          background: #f1e8f4;
          color: #654b70;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
        }

        .runner-image-upload-button.uploading {
          opacity: 0.6;
          cursor: wait;
        }

        .runner-image-upload-button input {
          display: none;
        }

        .runner-image-preview-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
          gap: 12px;
          margin-top: 16px;
        }

        .runner-image-preview-item {
          min-width: 0;
          padding: 8px;
          background: white;
          border: 1px solid #eadfec;
          border-radius: 10px;
        }

        .runner-image-preview-item img {
          display: block;
          width: 100%;
          height: 115px;
          object-fit: contain;
          border-radius: 7px;
          background: #f8f5f9;
        }

        .runner-image-preview-item button {
          width: 100%;
          margin-top: 8px;
          padding: 7px;
          border: 0;
          border-radius: 7px;
          background: #fff0f1;
          color: #a13f55;
          font-size: 12px;
          cursor: pointer;
        }

        .runner-image-preview-item button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .runner-image-loading {
          height: 115px;
          display: grid;
          place-items: center;
          background: #f8f5f9;
          color: #927a99;
          font-size: 12px;
          border-radius: 7px;
        }

        .runner-navigation {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          margin-top: 28px;
        }

        .runner-navigation button {
          padding: 11px 18px;
          border: 0;
          border-radius: 10px;
          background: #f1e8f4;
          color: #654b70;
          cursor: pointer;
        }

        .runner-navigation button:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .runner-last-question {
          color: #98789f;
          font-size: 13px;
        }

        .runner-question-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 8px;
          margin: 16px 0;
        }

        .runner-question-number {
          width: 38px;
          height: 38px;
          border: 1px solid #eadfec;
          border-radius: 9px;
          background: white;
          color: #6b5871;
          cursor: pointer;
        }

        .runner-question-number.answered {
          background: #e8f4eb;
          border-color: #b7d9bf;
        }

        .runner-question-number.active {
          outline: 2px solid #aa83b4;
        }

        .runner-save-status {
          font-size: 12px;
          color: #71917a;
          line-height: 1.5;
          margin: 18px 0;
        }

        .runner-submit-button,
        .runner-primary-button {
          width: 100%;
          border: 0;
          border-radius: 12px;
          background: #9b78a8;
          color: white;
          padding: 14px 18px;
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
        }

        .runner-submit-button:disabled,
        .runner-primary-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .runner-sidebar-note {
          font-size: 12px;
          line-height: 1.5;
          color: #927a99;
        }

        .runner-start-card,
        .runner-submitted-card {
          max-width: 650px;
          margin: 30px auto;
          line-height: 1.6;
        }

        .runner-info {
          background: #faf6fb;
          padding: 15px;
          border-radius: 12px;
          margin: 20px 0;
        }

        .runner-warning,
        .runner-practice-note {
          padding: 14px;
          border-radius: 10px;
          margin: 18px 0;
          font-size: 13px;
        }

        .runner-warning {
          background: #fff0f1;
          color: #9b4353;
        }

        .runner-practice-note {
          background: #eef7f0;
          color: #547b60;
        }

        .runner-error {
          background: #fff0f1;
          color: #a33f50;
          padding: 12px;
          border-radius: 10px;
          margin: 12px 0;
        }

        .runner-success-icon {
          width: 65px;
          height: 65px;
          display: grid;
          place-items: center;
          background: #e9f5ec;
          color: #4d9560;
          border-radius: 50%;
          font-size: 32px;
          margin-bottom: 18px;
        }

        @media (max-width: 750px) {
          .runner-layout {
            grid-template-columns: 1fr;
          }

          .runner-question-sidebar {
            order: -1;
          }

          .runner-question-grid {
            grid-template-columns: repeat(6, 1fr);
          }

          .student-runner-page {
            padding: 12px;
          }

          .runner-matching-row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </section>
  );
}

export default StudentTestRunner;
