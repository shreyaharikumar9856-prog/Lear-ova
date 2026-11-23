import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import "./TestMaker.css";

const questionTypes = [
  { value: "mcq", label: "Multiple Choice (MCQ)" },
  { value: "multiple_select", label: "Multiple Select" },
  { value: "fill_blank", label: "Fill in the Blanks" },
  { value: "true_false", label: "True or False" },
  { value: "short_answer", label: "Short Answer" },
  { value: "long_answer", label: "Long Answer" },
  { value: "matching", label: "Match the Following" },
  { value: "one_word", label: "One-Word Answer" },
  { value: "ordering", label: "Ordering / Sequencing" },
  { value: "diagram_label", label: "Diagram Labelling" },
];

function createQuestion(type = "mcq") {
  return {
    id: globalThis.crypto?.randomUUID?.() ||
      String(Date.now() + Math.random()),

    question_type: type,
    question_text: "",
    marks: 1,
    negative_marks: 0,

    options: [
      { id: "A", text: "" },
      { id: "B", text: "" },
      { id: "C", text: "" },
      { id: "D", text: "" },
    ],

    correct_option: "A",
    correct_options: [],

    accepted_answers: "",
    true_false_answer: "true",

    pairs: [
      { left: "", right: "" },
      { left: "", right: "" },
    ],

    ordering_items: ["", ""],

    model_answer: "",
    keywords: "",
  };
}

function TestMaker() {
  // =====================================
  // DATA STATES
  // =====================================

  const [subjects, setSubjects] = useState([]);
  const [students, setStudents] = useState([]);
  const [tests, setTests] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");

  // =====================================
  // TEST FORM STATES
  // =====================================

  const [title, setTitle] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [grade, setGrade] = useState("");
  const [description, setDescription] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [assessmentType, setAssessmentType] = useState("practice");

  const [testMode, setTestMode] = useState("online");

  const [duration, setDuration] = useState(30);
  const [passingMarks, setPassingMarks] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [allowMultipleAttempts, setAllowMultipleAttempts] =
    useState(false);

  const [maxAttempts, setMaxAttempts] = useState(2);
  const [shuffleQuestions, setShuffleQuestions] =
    useState(false);

  const [shuffleOptions, setShuffleOptions] =
    useState(false);

  const [resultRelease, setResultRelease] =
    useState("after_review");

  const [testStatus, setTestStatus] = useState("draft");

  const [selectedStudentIds, setSelectedStudentIds] =
    useState([]);

  const [questionPaper, setQuestionPaper] = useState(null);

  // =====================================
  // QUESTIONS
  // =====================================

  const [questions, setQuestions] = useState([
    createQuestion("mcq"),
  ]);

  const totalMarks = questions.reduce(
    (total, question) =>
      total + (Number(question.marks) || 0),
    0
  );

  // =====================================
  // LOAD DATABASE DATA
  // =====================================

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);

    try {
      const [
        subjectResult,
        studentResult,
        testResult,
      ] = await Promise.all([

        supabase
          .from("subjects")
          .select("id, subject_name")
          .order("subject_name"),

        supabase
          .from("students")
          .select("id, full_name")
          .order("full_name"),

        supabase
          .from("tests")
          .select("*")
          .order("created_at", {
            ascending: false,
          }),
      ]);

      if (subjectResult.error) throw subjectResult.error;
      if (studentResult.error) throw studentResult.error;
      if (testResult.error) throw testResult.error;

      setSubjects(subjectResult.data || []);
      setStudents(studentResult.data || []);
      setTests(testResult.data || []);

      // Prefill the teacher name from the signed-in account.
      if (!teacherName.trim()) {
        const { data: authData } = await supabase.auth.getUser();
        const user = authData?.user;
        const profileName =
          user?.user_metadata?.full_name ||
          user?.user_metadata?.name ||
          user?.email?.split("@")[0] ||
          "";
        if (profileName) setTeacherName(profileName);
      }

      if (
        !subjectId &&
        subjectResult.data?.length
      ) {
        setSubjectId(
          String(subjectResult.data[0].id)
        );
      }

    } catch (error) {
      console.error("Test Maker loading error:", error);

      setMessage(
        error.message || "Unable to load Test Maker."
      );

      setMessageType("error");

    } finally {
      setLoading(false);
    }
  }

  // =====================================
  // STUDENT SELECTION
  // =====================================

  function toggleStudent(id) {
    const studentId = String(id);

    setSelectedStudentIds((previous) =>
      previous.includes(studentId)
        ? previous.filter((item) => item !== studentId)
        : [...previous, studentId]
    );
  }

  function selectAllStudents() {
    setSelectedStudentIds(
      students.map((student) => String(student.id))
    );
  }

  function clearStudents() {
    setSelectedStudentIds([]);
  }

  // =====================================
  // QUESTION MANAGEMENT
  // =====================================

  function updateQuestion(index, field, value) {
    setQuestions((previous) =>
      previous.map((question, i) =>
        i === index
          ? { ...question, [field]: value }
          : question
      )
    );
  }

  function changeQuestionType(index, type) {
    setQuestions((previous) =>
      previous.map((question, i) => {
        if (i !== index) return question;

        return {
          ...createQuestion(type),
          id: question.id,
          question_text: question.question_text,
          marks: question.marks,
          negative_marks: question.negative_marks,
        };
      })
    );
  }

  function addQuestion() {
    setQuestions((previous) => [
      ...previous,
      createQuestion("mcq"),
    ]);

    setMessage("");
  }

  function deleteQuestion(index) {
    if (questions.length === 1) {
      setMessage("A test must contain at least one question.");
      setMessageType("error");
      return;
    }

    setQuestions((previous) =>
      previous.filter((_, i) => i !== index)
    );
  }

  // =====================================
  // MCQ OPTIONS
  // =====================================

  function updateOption(questionIndex, optionIndex, value) {
    setQuestions((previous) =>
      previous.map((question, i) => {
        if (i !== questionIndex) return question;

        const options = [...question.options];

        options[optionIndex] = {
          ...options[optionIndex],
          text: value,
        };

        return { ...question, options };
      })
    );
  }

  function addOption(index) {
    setQuestions((previous) =>
      previous.map((question, i) => {
        if (i !== index) return question;

        const optionId = String.fromCharCode(
          65 + question.options.length
        );

        return {
          ...question,
          options: [
            ...question.options,
            { id: optionId, text: "" },
          ],
        };
      })
    );
  }

  function removeOption(index, optionIndex) {
    setQuestions((previous) =>
      previous.map((question, i) => {
        if (i !== index) return question;

        const removedId =
          question.options[optionIndex].id;

        const options = question.options.filter(
          (_, j) => j !== optionIndex
        );

        return {
          ...question,
          options,
          correct_option:
            question.correct_option === removedId
              ? ""
              : question.correct_option,

          correct_options:
            question.correct_options.filter(
              (item) => item !== removedId
            ),
        };
      })
    );
  }

  function toggleCorrectOption(index, optionId) {
    setQuestions((previous) =>
      previous.map((question, i) => {
        if (i !== index) return question;

        const exists =
          question.correct_options.includes(optionId);

        return {
          ...question,
          correct_options: exists
            ? question.correct_options.filter(
                (item) => item !== optionId
              )
            : [...question.correct_options, optionId],
        };
      })
    );
  }

  // =====================================
  // MATCHING QUESTIONS
  // =====================================

  function updatePair(index, pairIndex, field, value) {
    setQuestions((previous) =>
      previous.map((question, i) => {
        if (i !== index) return question;

        const pairs = [...question.pairs];

        pairs[pairIndex] = {
          ...pairs[pairIndex],
          [field]: value,
        };

        return { ...question, pairs };
      })
    );
  }

  function addPair(index) {
    setQuestions((previous) =>
      previous.map((question, i) =>
        i === index
          ? {
              ...question,
              pairs: [
                ...question.pairs,
                { left: "", right: "" },
              ],
            }
          : question
      )
    );
  }

  function removePair(index, pairIndex) {
    setQuestions((previous) =>
      previous.map((question, i) =>
        i === index
          ? {
              ...question,
              pairs: question.pairs.filter(
                (_, j) => j !== pairIndex
              ),
            }
          : question
      )
    );
  }

  // =====================================
  // ORDERING QUESTIONS
  // =====================================

  function updateOrderingItem(index, itemIndex, value) {
    setQuestions((previous) =>
      previous.map((question, i) => {
        if (i !== index) return question;

        const items = [...question.ordering_items];
        items[itemIndex] = value;

        return {
          ...question,
          ordering_items: items,
        };
      })
    );
  }

  function addOrderingItem(index) {
    setQuestions((previous) =>
      previous.map((question, i) =>
        i === index
          ? {
              ...question,
              ordering_items: [
                ...question.ordering_items,
                "",
              ],
            }
          : question
      )
    );
  }

  function removeOrderingItem(index, itemIndex) {
    setQuestions((previous) =>
      previous.map((question, i) =>
        i === index
          ? {
              ...question,
              ordering_items:
                question.ordering_items.filter(
                  (_, j) => j !== itemIndex
                ),
            }
          : question
      )
    );
  }

  // =====================================
  // GET QUESTION OPTIONS AND ANSWER KEY
  // =====================================

  function buildQuestionData(question, index) {
    let options = [];
    let correctAnswer = {};
    let settings = {};

    if (question.question_type === "mcq") {
      options = question.options.filter(
        (item) => item.text.trim()
      );

      correctAnswer = {
        option_id: question.correct_option,
      };
    }

    if (
      question.question_type === "multiple_select"
    ) {
      options = question.options.filter(
        (item) => item.text.trim()
      );

      correctAnswer = {
        option_ids: question.correct_options,
      };
    }

    if (
      question.question_type === "fill_blank" ||
      question.question_type === "one_word"
    ) {
      correctAnswer = {
        accepted_answers: question.accepted_answers
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean),
      };
    }

    if (question.question_type === "true_false") {
      correctAnswer = {
        value: question.true_false_answer === "true",
      };
    }

    if (question.question_type === "matching") {
      options = {
        pairs: question.pairs.filter(
          (pair) =>
            pair.left.trim() && pair.right.trim()
        ),
      };

      correctAnswer = {
        pairs: options.pairs,
      };
    }

    if (question.question_type === "ordering") {
      options = {
        items: question.ordering_items.filter(
          (item) => item.trim()
        ),
      };

      correctAnswer = {
        correct_order: options.items,
      };
    }

    if (
      question.question_type === "short_answer" ||
      question.question_type === "long_answer" ||
      question.question_type === "diagram_label"
    ) {
      correctAnswer = {
        model_answer: question.model_answer.trim(),
        keywords: question.keywords
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean),
      };
    }

    return {
      test_id: null,
      question_type: question.question_type,
      question_text: question.question_text.trim(),
      options,
      marks: Number(question.marks),
      negative_marks: Number(question.negative_marks) || 0,
      question_order: index + 1,
      settings,
      correct_answer: correctAnswer,
    };
  }

  // =====================================
  // VALIDATE QUESTIONS
  // =====================================

  function validateQuestions() {
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const number = i + 1;

      if (!q.question_text.trim()) {
        return `Please enter Question ${number}.`;
      }

      if (
        !Number.isFinite(Number(q.marks)) ||
        Number(q.marks) <= 0
      ) {
        return `Enter valid marks for Question ${number}.`;
      }

      if (
        !Number.isFinite(Number(q.negative_marks)) ||
        Number(q.negative_marks) < 0
      ) {
        return `Enter valid negative marks for Question ${number}.`;
      }

      if (q.question_type === "mcq") {
        const options = q.options.filter(
          (item) => item.text.trim()
        );

        if (options.length < 2) {
          return `Question ${number} needs at least two options.`;
        }

        if (
          !options.some(
            (item) => item.id === q.correct_option
          )
        ) {
          return `Select the correct answer for Question ${number}.`;
        }
      }

      if (
        q.question_type === "multiple_select"
      ) {
        const options = q.options.filter(
          (item) => item.text.trim()
        );

        if (options.length < 2) {
          return `Question ${number} needs at least two options.`;
        }

        if (q.correct_options.length === 0) {
          return `Select the correct answers for Question ${number}.`;
        }
      }

      if (
        q.question_type === "fill_blank" ||
        q.question_type === "one_word"
      ) {
        if (!q.accepted_answers.trim()) {
          return `Enter the answer for Question ${number}.`;
        }
      }

      if (
        q.question_type === "matching" &&
        !q.pairs.some(
          (pair) => pair.left.trim() && pair.right.trim()
        )
      ) {
        return `Complete the matching pairs for Question ${number}.`;
      }

      if (
        q.question_type === "ordering" &&
        q.ordering_items.filter((item) => item.trim()).length < 2
      ) {
        return `Question ${number} needs at least two items.`;
      }

      if (
        (
          q.question_type === "short_answer" ||
          q.question_type === "long_answer" ||
          q.question_type === "diagram_label"
        ) &&
        !q.model_answer.trim()
      ) {
        return `Please provide a suggested answer for Question ${number}.`;
      }
    }

    return null;
  }

  // =====================================
  // QUESTION PAPER UPLOAD
  // =====================================

  async function uploadQuestionPaper(file, testId) {
    const safeName = file.name.replace(
      /[^a-zA-Z0-9._-]/g,
      "_"
    );

    const path =
      `${testId}/${crypto.randomUUID()}-${safeName}`;

    const { error } = await supabase.storage
      .from("test-materials")
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (error) throw error;

    return path;
  }

  // =====================================
  // CREATE TEST
  // =====================================

  async function createTest(event) {
    event.preventDefault();

    setMessage("");
    setSaving(true);

    let createdTestId = null;
    let uploadedPaperPath = null;

    try {
      if (!title.trim()) {
        throw new Error("Enter a test title.");
      }

      if (!subjectId) {
        throw new Error("Select a subject.");
      }

      if (selectedStudentIds.length === 0) {
        throw new Error("Select at least one student.");
      }

      if (questions.length === 0) {
        throw new Error("Add at least one question.");
      }

     if (assessmentType === "exam" && Number(duration) <= 0) {
       throw new Error("Examination Mode requires a timer.");
      }

     if (assessmentType === "practice" && Number(duration) < 0) {
       throw new Error("Duration cannot be negative.");
      }

      if (
        allowMultipleAttempts &&
        (!Number.isInteger(Number(maxAttempts)) || Number(maxAttempts) < 2)
      ) {
        throw new Error("Maximum attempts must be a whole number of at least 2.");
      }

      if (startDate && endDate) {
        if (new Date(endDate) <= new Date(startDate)) {
          throw new Error(
            "Test end time must be later than start time."
          );
        }
      }

      if (
        passingMarks !== "" &&
        (
          Number(passingMarks) < 0 ||
          Number(passingMarks) > totalMarks
        )
      ) {
        throw new Error(
          "Passing marks cannot exceed total marks."
        );
      }

      if (testMode === "upload" && !questionPaper) {
        throw new Error("Upload the question paper for Uploaded Question Paper mode.");
      }

      if (
        questionPaper &&
        questionPaper.size > 50 * 1024 * 1024
      ) {
        throw new Error("Question paper must be below 50 MB.");
      }

      const validationError = validateQuestions();

      if (validationError) {
      throw new Error(validationError);
      }
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;

      if (!user) {
        throw new Error("Please log in again.");
      }

      // CREATE TEST RECORD

      const testPayload = {
        title: title.trim(),
        subject_id: subjectId,
        grade: grade.trim() || null,
       description: description.trim() || null,
       assessment_type: assessmentType,
       test_mode: testMode,
        duration_minutes: Number(duration),
        scheduled_start: startDate
          ? new Date(startDate).toISOString()
          : null,
        scheduled_end: endDate
          ? new Date(endDate).toISOString()
          : null,
        total_marks: totalMarks,
        passing_marks:
          passingMarks === ""
            ? null
            : Number(passingMarks),
        allow_multiple_attempts: allowMultipleAttempts,
        max_attempts: allowMultipleAttempts
          ? Number(maxAttempts)
          : 1,
        shuffle_questions: shuffleQuestions,
        shuffle_options: shuffleOptions,
        result_release: resultRelease,
        status: testStatus,
        created_by: user.id,
        teacher_name: teacherName.trim(),
      };

      const { data: newTest, error: testError } =
        await supabase
          .from("tests")
          .insert(testPayload)
          .select("id")
          .single();

      if (testError) throw testError;

      createdTestId = newTest.id;

      // UPLOAD QUESTION PAPER IF PROVIDED

      if (questionPaper) {
        uploadedPaperPath = await uploadQuestionPaper(
          questionPaper,
          createdTestId
        );

        const { error: paperUpdateError } =
          await supabase
            .from("tests")
            .update({
              question_paper_path: uploadedPaperPath,
            })
            .eq("id", createdTestId);

        if (paperUpdateError) throw paperUpdateError;
      }

      // INSERT QUESTIONS

      const questionRows = questions.map(
        (question, index) => {
          const data = buildQuestionData(question, index);

          return {
            test_id: createdTestId,
            question_type: data.question_type,
            question_text: data.question_text,
            options: data.options,
            marks: data.marks,
            negative_marks: data.negative_marks,
            question_order: data.question_order,
            settings: data.settings,
          };
        }
      );

      const { data: insertedQuestions, error: questionError } =
        await supabase
          .from("test_questions")
          .insert(questionRows)
          .select("id, question_order");

      if (questionError) throw questionError;

      const sortedInserted = [...insertedQuestions].sort(
        (a, b) => a.question_order - b.question_order
      );

      // INSERT ANSWER KEYS

      const keyRows = sortedInserted.map((item, index) => ({
        question_id: item.id,
        correct_answer: buildQuestionData(
          questions[index],
          index
        ).correct_answer,
        explanation: null,
      }));

      const { error: keyError } = await supabase
        .from("test_question_keys")
        .insert(keyRows);

      if (keyError) throw keyError;

      // ASSIGN TEST TO SELECTED STUDENTS

      const assignments = students
        .filter((student) =>
          selectedStudentIds.includes(String(student.id))
        )
        .map((student) => ({
          test_id: createdTestId,
          student_id: student.id,
          assigned_by: user.id,
        }));

      const { error: assignmentError } = await supabase
        .from("test_assignments")
        .insert(assignments);

      if (assignmentError) throw assignmentError;

      // RESET FORM

      setTitle("");
      setGrade("");
      setDescription("");
      setTeacherName("");
      setDuration(30);
      setPassingMarks("");
      setStartDate("");
      setEndDate("");
      setTestMode("online");
      setAssessmentType("practice");
      setAllowMultipleAttempts(false);
      setMaxAttempts(2);
      setShuffleQuestions(false);
      setShuffleOptions(false);
      setResultRelease("after_review");
      setTestStatus("draft");
      setSelectedStudentIds([]);
      setQuestionPaper(null);
      setQuestions([createQuestion("mcq")]);

      const paperInput = document.getElementById(
        "test-question-paper"
      );

      if (paperInput) paperInput.value = "";

      await loadData();

      setMessage(
        "Test created successfully! 🎉"
      );

      setMessageType("success");

    } catch (error) {
      console.error("Create test error:", error);

      // Remove incomplete test and related records

      if (createdTestId) {
        const { error: rollbackError } =
          await supabase
            .from("tests")
            .delete()
            .eq("id", createdTestId);

        if (rollbackError) {
          console.error(
            "Test cleanup error:",
            rollbackError.message
          );
        }
      }

      if (uploadedPaperPath) {
        await supabase.storage
          .from("test-materials")
          .remove([uploadedPaperPath]);
      }

      setMessage(
        error.message || "Unable to create test."
      );

      setMessageType("error");

    } finally {
      setSaving(false);
    }
  }

  // =====================================
  // HELPERS
  // =====================================

  function getSubjectName(id) {
    return (
      subjects.find(
        (subject) => String(subject.id) === String(id)
      )?.subject_name || "Subject"
    );
  }

  function questionTypeName(type) {
    return (
      questionTypes.find((item) => item.value === type)
        ?.label || type
    );
  }

  // =====================================
  // QUESTION EDITOR
  // =====================================

  function renderQuestionEditor(question, index) {
    return (

      <article
        className="tm-question-card"
        key={question.id}
      >

        <div className="tm-question-heading">

          <h3>
            Question {index + 1}
          </h3>

          <button
            type="button"
            className="tm-delete-question"
            onClick={() => deleteQuestion(index)}
          >
            🗑 Delete
          </button>

        </div>


        {/* QUESTION TYPE */}

        <div className="tm-field">

          <label>Question Type</label>

          <select
            value={question.question_type}
            onChange={(event) =>
              changeQuestionType(index, event.target.value)
            }
          >

            {questionTypes.map((type) => (

              <option
                key={type.value}
                value={type.value}
              >
                {type.label}
              </option>

            ))}

          </select>

        </div>


        {/* QUESTION TEXT */}

        <div className="tm-field">

          <label>Question *</label>

          <textarea
            value={question.question_text}
            onChange={(event) =>
              updateQuestion(
                index,
                "question_text",
                event.target.value
              )
            }
            rows={3}
            placeholder="Enter your question here..."
            required
          />

        </div>


        {/* MARK SETTINGS */}

        <div className="tm-mark-row">

          <div className="tm-field">

            <label>Marks *</label>

            <input
              type="number"
              min="0.5"
              step="0.5"
              value={question.marks}
              onChange={(event) =>
                updateQuestion(
                  index,
                  "marks",
                  event.target.value
                )
              }
            />

          </div>

          <div className="tm-field">

            <label>Negative Marks</label>

            <input
              type="number"
              min="0"
              step="0.25"
              value={question.negative_marks}
              onChange={(event) =>
                updateQuestion(
                  index,
                  "negative_marks",
                  event.target.value
                )
              }
            />

          </div>

        </div>


        {/* MCQ */}

        {(
          question.question_type === "mcq" ||
          question.question_type === "multiple_select"
        ) && (

          <div className="tm-question-answer-area">

            <h4>Answer Options</h4>

            <p>
              {question.question_type === "mcq"
                ? "Select the correct option."
                : "Select all correct options."}
            </p>

            {question.options.map((option, optionIndex) => (

              <div
                className="tm-option-row"
                key={option.id}
              >

                <span className="tm-option-letter">
                  {option.id}
                </span>

                <input
                  type="text"
                  value={option.text}
                  onChange={(event) =>
                    updateOption(
                      index,
                      optionIndex,
                      event.target.value
                    )
                  }
                  placeholder={`Option ${option.id}`}
                />

                {question.question_type === "mcq" ? (

                  <input
                    type="radio"
                    name={`correct-${question.id}`}
                    checked={
                      question.correct_option === option.id
                    }
                    onChange={() =>
                      updateQuestion(
                        index,
                        "correct_option",
                        option.id
                      )
                    }
                    title="Correct answer"
                  />

                ) : (

                  <input
                    type="checkbox"
                    checked={question.correct_options.includes(
                      option.id
                    )}
                    onChange={() =>
                      toggleCorrectOption(index, option.id)
                    }
                    title="Correct answer"
                  />

                )}

                {question.options.length > 2 && (

                  <button
                    type="button"
                    onClick={() =>
                      removeOption(index, optionIndex)
                    }
                  >
                    ✕
                  </button>

                )}

              </div>

            ))}

            <button
              type="button"
              className="tm-secondary-button"
              onClick={() => addOption(index)}
            >
              + Add Option
            </button>

          </div>

        )}


        {/* FILL IN THE BLANKS */}

        {(
          question.question_type === "fill_blank" ||
          question.question_type === "one_word"
        ) && (

          <div className="tm-field">

            <label>Correct Answer(s) *</label>

            <textarea
              rows={3}
              value={question.accepted_answers}
              onChange={(event) =>
                updateQuestion(
                  index,
                  "accepted_answers",
                  event.target.value
                )
              }
              placeholder={
                "Enter one accepted answer per line.\nExample:\nPhotosynthesis"
              }
            />

            <small>
              Add alternative accepted answers on separate lines.
            </small>

          </div>

        )}


        {/* TRUE FALSE */}

        {question.question_type === "true_false" && (

          <div className="tm-field">

            <label>Correct Answer</label>

            <select
              value={question.true_false_answer}
              onChange={(event) =>
                updateQuestion(
                  index,
                  "true_false_answer",
                  event.target.value
                )
              }
            >
              <option value="true">True</option>
              <option value="false">False</option>
            </select>

          </div>

        )}


        {/* MATCHING */}

        {question.question_type === "matching" && (

          <div className="tm-question-answer-area">

            <h4>Matching Pairs</h4>

            <p>
              Enter each correctly matched pair.
              Students will match the two columns.
            </p>

            {question.pairs.map((pair, pairIndex) => (

              <div
                className="tm-matching-row"
                key={pairIndex}
              >

                <input
                  value={pair.left}
                  onChange={(event) =>
                    updatePair(
                      index,
                      pairIndex,
                      "left",
                      event.target.value
                    )
                  }
                  placeholder={`Column A - ${pairIndex + 1}`}
                />

                <span>↔</span>

                <input
                  value={pair.right}
                  onChange={(event) =>
                    updatePair(
                      index,
                      pairIndex,
                      "right",
                      event.target.value
                    )
                  }
                  placeholder={`Column B - ${pairIndex + 1}`}
                />

                {question.pairs.length > 1 && (

                  <button
                    type="button"
                    onClick={() =>
                      removePair(index, pairIndex)
                    }
                  >
                    ✕
                  </button>

                )}

              </div>

            ))}

            <button
              type="button"
              className="tm-secondary-button"
              onClick={() => addPair(index)}
            >
              + Add Matching Pair
            </button>

          </div>

        )}


        {/* ORDERING */}

        {question.question_type === "ordering" && (

          <div className="tm-question-answer-area">

            <h4>Correct Sequence</h4>

            <p>
              Enter items in their correct order.
            </p>

            {question.ordering_items.map((item, itemIndex) => (

              <div
                className="tm-option-row"
                key={itemIndex}
              >

                <span className="tm-option-letter">
                  {itemIndex + 1}
                </span>

                <input
                  value={item}
                  onChange={(event) =>
                    updateOrderingItem(
                      index,
                      itemIndex,
                      event.target.value
                    )
                  }
                  placeholder={`Item ${itemIndex + 1}`}
                />

                {question.ordering_items.length > 2 && (

                  <button
                    type="button"
                    onClick={() =>
                      removeOrderingItem(index, itemIndex)
                    }
                  >
                    ✕
                  </button>

                )}

              </div>

            ))}

            <button
              type="button"
              className="tm-secondary-button"
              onClick={() => addOrderingItem(index)}
            >
              + Add Item
            </button>

          </div>

        )}


        {/* SHORT / LONG / DIAGRAM */}

        {(
          question.question_type === "short_answer" ||
          question.question_type === "long_answer" ||
          question.question_type === "diagram_label"
        ) && (

          <div className="tm-question-answer-area">

            <h4>Suggested Answer / Marking Guide *</h4>

            <textarea
              rows={4}
              value={question.model_answer}
              onChange={(event) =>
                updateQuestion(
                  index,
                  "model_answer",
                  event.target.value
                )
              }
              placeholder="Enter the expected answer or marking guide..."
            />

            <div className="tm-field">

              <label>
                Important Keywords
              </label>

              <textarea
                rows={2}
                value={question.keywords}
                onChange={(event) =>
                  updateQuestion(
                    index,
                    "keywords",
                    event.target.value
                  )
                }
                placeholder="Enter one keyword per line."
              />

            </div>

            <small>
              These answers will be used for teacher correction.
              They will not be shown to students during the test.
            </small>

          </div>

        )}

      </article>

    );
  }

  // =====================================
  // MAIN PAGE
  // =====================================

  return (

    <section className="test-maker">

      {/* HEADER */}

      <div className="tm-header">

        <div>

          <span>LEARÑOVA • TEACHER SPACE</span>

          <h2>📝 Test Maker</h2>

          <p>
            Create customised examinations and assessments.
          </p>

        </div>

        <div className="tm-header-icon">
          🎓
        </div>

      </div>


      {/* MESSAGE */}

      {message && (

        <div
          className={`tm-message ${
            messageType === "success"
              ? "tm-success"
              : "tm-error"
          }`}
          role="status"
        >
          {message}
        </div>

      )}


      {/* CREATE TEST */}

      <form
        className="tm-panel"
        onSubmit={createTest}
      >

        <div className="tm-section-heading">
          <h3>✏️ Create New Test</h3>
          <p>Enter test details and prepare your questions.</p>
        </div>


        {/* TEST INFORMATION */}

        <h4 className="tm-subheading">
          1. Test Information
        </h4>

        <div className="tm-grid">

          <div className="tm-field">

            <label>Test Title *</label>

            <input
              value={title}
              onChange={(event) =>
                setTitle(event.target.value)
              }
              placeholder="e.g. Chapter 3 Mathematics Test"
              required
            />

          </div>


          <div className="tm-field">

            <label>Subject *</label>

            <select
              value={subjectId}
              onChange={(event) =>
                setSubjectId(event.target.value)
              }
              required
            >

              <option value="">Select Subject</option>

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


          <div className="tm-field">

            <label>Grade / Class</label>

            <input
              value={grade}
              onChange={(event) =>
                setGrade(event.target.value)
              }
              placeholder="e.g. Grade 5"
            />

          </div>


          <div className="tm-field">

            <label>Teacher Name *</label>

            <input
              value={teacherName}
              onChange={(event) =>
                setTeacherName(event.target.value)
              }
              placeholder="Enter teacher name"
              required
            />

          </div>

        </div>


        <div className="tm-field">

          <label>Description</label>

          <textarea
            rows={3}
            value={description}
            onChange={(event) =>
              setDescription(event.target.value)
            }
            placeholder="Brief description of the examination..."
          />

        </div>


        {/* STUDENT ASSIGNMENT */}

        <h4 className="tm-subheading">
          2. Assign Students
        </h4>

        <div className="tm-student-box">

          <div className="tm-student-heading">

            <strong>
              Select students for this test
            </strong>

            <div>

              <button
                type="button"
                onClick={selectAllStudents}
              >
                Select All
              </button>

              <button
                type="button"
                onClick={clearStudents}
              >
                Clear
              </button>

            </div>

          </div>


          <p>
            {selectedStudentIds.length} of {students.length} students selected
          </p>


          {students.length === 0 ? (

            <p>No students registered yet.</p>

          ) : (

            <div className="tm-student-list">

              {students.map((student) => (

                <label
                  key={student.id}
                  className="tm-student-option"
                >

                  <input
                    type="checkbox"
                    checked={selectedStudentIds.includes(
                      String(student.id)
                    )}
                    onChange={() =>
                      toggleStudent(student.id)
                    }
                  />

                  {student.full_name}

                </label>

              ))}

            </div>

          )}

        </div>


        {/* TEST SETTINGS */}

        <h4 className="tm-subheading">
          3. Test Settings
        </h4>
        <div className="tm-grid">

  <div className="tm-field">
    <label>Test Delivery Mode *</label>
    <select
      value={testMode}
      onChange={(event) => setTestMode(event.target.value)}
    >
      <option value="online">Online Test</option>
      <option value="upload">Uploaded Question Paper</option>
      <option value="hybrid">Online + Uploaded Paper</option>
    </select>
    <small>
      Choose online answering, an uploaded paper, or both.
    </small>
  </div>

  <div className="tm-field">
    <label>Assessment Type *</label>

    <select
      value={assessmentType}
      onChange={(event) =>
        setAssessmentType(event.target.value)
      }
      required
    >
      <option value="exam">📝 Examination Mode</option>
      <option value="practice">📚 Practice Mode</option>
    </select>

    <small>
      Examination Mode applies formal exam rules.
      Practice Mode allows flexible revision.
    </small>
  </div>

</div>

       <div className="tm-field">
  <label>Duration (Minutes)</label>

  <input
    type="number"
    min={assessmentType === "exam" ? "1" : "0"}
    value={duration}
    onChange={(event) =>
      setDuration(event.target.value)
    }
    required={assessmentType === "exam"}
  />

  <small>
    {assessmentType === "exam"
      ? "A timer is mandatory for examinations."
      : "Enter 0 for unlimited practice time."}
  </small>
</div>

        {/* EXTRA SETTINGS */}

        <div className="tm-extra-settings">

          <label>
            <input
              type="checkbox"
              checked={allowMultipleAttempts}
              onChange={(event) =>
                setAllowMultipleAttempts(
                  event.target.checked
                )
              }
            />

            Allow multiple attempts
          </label>


          {allowMultipleAttempts && (

            <div className="tm-field tm-attempt-field">

              <label>Maximum Attempts</label>

              <input
                type="number"
                min="2"
                value={maxAttempts}
                onChange={(event) =>
                  setMaxAttempts(event.target.value)
                }
              />

            </div>

          )}


          <label>
            <input
              type="checkbox"
              checked={shuffleQuestions}
              onChange={(event) =>
                setShuffleQuestions(event.target.checked)
              }
            />

            Shuffle questions
          </label>


          <label>
            <input
              type="checkbox"
              checked={shuffleOptions}
              onChange={(event) =>
                setShuffleOptions(event.target.checked)
              }
            />

            Shuffle answer options
          </label>

        </div>


        <div className="tm-field">

          <label>Result Visibility</label>

          <select
            value={resultRelease}
            onChange={(event) =>
              setResultRelease(event.target.value)
            }
          >
            <option value="after_review">
              After teacher review
            </option>

            <option value="immediate">
              Immediately after submission
            </option>

            <option value="manual">
              Teacher releases results manually
            </option>

          </select>

        </div>


        <div className="tm-field">

          <label>Test Status</label>

          <select
            value={testStatus}
            onChange={(event) =>
              setTestStatus(event.target.value)
            }
          >
            <option value="draft">Save as Draft</option>
            <option value="published">Publish Test</option>
          </select>

        </div>


        {/* QUESTION PAPER UPLOAD */}

        {(
          testMode === "upload" ||
          testMode === "hybrid"
        ) && (

          <div className="tm-field">

            <label>Upload Question Paper (Optional)</label>

            <input
              id="test-question-paper"
              type="file"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
              onChange={(event) =>
                setQuestionPaper(
                  event.target.files?.[0] || null
                )
              }
            />

            <small>
              Maximum file size: 50 MB.
            </small>

          </div>

        )}


        {/* QUESTIONS */}

        <div className="tm-question-section">

          <div className="tm-question-section-heading">

            <div>
              <h3>4. Add Questions</h3>
              <p>
                Create questions and assign marks individually.
              </p>
            </div>

            <span>
              {questions.length} Questions
            </span>

          </div>


          {questions.map((question, index) =>
            renderQuestionEditor(question, index)
          )}


          <button
            type="button"
            className="tm-add-question"
            onClick={addQuestion}
          >
            + Add Another Question
          </button>

        </div>


        {/* TOTAL MARKS */}

        <div className="tm-final-summary">

          <div>
            <span>Total Questions</span>
            <strong>{questions.length}</strong>
          </div>

          <div>
            <span>Total Marks</span>
            <strong>{totalMarks}</strong>
          </div>

          <div>
            <span>Assigned Students</span>
            <strong>{selectedStudentIds.length}</strong>
          </div>

        </div>


        {/* SUBMIT */}

        <button
          type="submit"
          className="tm-create-button"
          disabled={
            saving ||
            loading ||
            subjects.length === 0 ||
            students.length === 0
          }
        >

          {saving
            ? "Creating Test..."
            : testStatus === "published"
              ? "🚀 Publish Test"
              : "💾 Save Test as Draft"}

        </button>

      </form>


      {/* EXISTING TESTS */}

      <div className="tm-panel tm-existing-tests">

        <div className="tm-section-heading">

          <h3>📋 My Tests</h3>

          <p>
            View examinations created in Learnova.
          </p>

        </div>


        {loading ? (

          <p>Loading tests...</p>

        ) : tests.length === 0 ? (

          <div className="tm-empty">
            🌷
            <h3>No tests created yet</h3>
            <p>Your created tests will appear here.</p>
          </div>

        ) : (

          <div className="tm-test-list">

            {tests.map((test) => (

              <article
                className="tm-test-card"
                key={test.id}
              >

                <div>

                  <span className={`tm-status tm-${test.status}`}>
                    {test.status}
                  </span>

                  <h3>{test.title}</h3>

                  <p>
                    📚 {getSubjectName(test.subject_id)}
                  </p>

                  <p>
                    👩‍🏫 {test.teacher_name || "Teacher"}
                  </p>

                </div>

                <div className="tm-test-details">

                  <span>
                    ⏱ {
                      Number(test.duration_minutes) > 0
                         ? `${test.duration_minutes} minutes`
                         : "No time limit"
                    }
                  </span>

                  <span>
                    🏆 {test.total_marks} marks
                  </span>

                  <span>
                    🎓 {test.grade || "Grade not specified"}
                  </span>

                </div>

                <small>
                  Created: {new Date(
                    test.created_at
                  ).toLocaleDateString()}
                </small>

              </article>

            ))}

          </div>

        )}

      </div>

    </section>
  );
}

export default TestMaker;
