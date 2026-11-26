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
    questionImageFile: null,
    questionImagePath: null,
    dbQuestionId: null,
  };
}

const TEST_MAKER_DRAFT_KEY = "learnova_test_maker_draft_v1";

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
  const [draftReady, setDraftReady] = useState(false);

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
  const [existingQuestionPaperPath, setExistingQuestionPaperPath] = useState("");
  const [editingTestId, setEditingTestId] = useState(null);
  const [duplicatingTest, setDuplicatingTest] = useState(false);
  const [viewingTest, setViewingTest] = useState(null);
  const [busyTestId, setBusyTestId] = useState(null);

  // =====================================
  // QUESTIONS
  // =====================================

  const [questions, setQuestions] = useState([
    createQuestion("mcq"),
  ]);

  // Restore an unfinished test when the page is reloaded or the browser
  // discards this tab to save memory. Uploaded File objects cannot be stored
  // in localStorage, so the teacher will be asked to select that file again.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(TEST_MAKER_DRAFT_KEY);
      if (saved) {
        const draft = JSON.parse(saved);
        if (draft && typeof draft === "object") {
          if (typeof draft.title === "string") setTitle(draft.title);
          if (draft.subjectId != null) setSubjectId(String(draft.subjectId));
          if (typeof draft.grade === "string") setGrade(draft.grade);
          if (typeof draft.description === "string") setDescription(draft.description);
          if (typeof draft.teacherName === "string") setTeacherName(draft.teacherName);
          if (typeof draft.assessmentType === "string") setAssessmentType(draft.assessmentType);
          if (typeof draft.testMode === "string") setTestMode(draft.testMode);
          if (draft.duration != null) setDuration(draft.duration);
          if (draft.passingMarks != null) setPassingMarks(draft.passingMarks);
          if (typeof draft.startDate === "string") setStartDate(draft.startDate);
          if (typeof draft.endDate === "string") setEndDate(draft.endDate);
          if (typeof draft.allowMultipleAttempts === "boolean") setAllowMultipleAttempts(draft.allowMultipleAttempts);
          if (draft.maxAttempts != null) setMaxAttempts(draft.maxAttempts);
          if (typeof draft.shuffleQuestions === "boolean") setShuffleQuestions(draft.shuffleQuestions);
          if (typeof draft.shuffleOptions === "boolean") setShuffleOptions(draft.shuffleOptions);
          if (typeof draft.resultRelease === "string") setResultRelease(draft.resultRelease);
          if (typeof draft.testStatus === "string") setTestStatus(draft.testStatus);
          if (Array.isArray(draft.selectedStudentIds)) setSelectedStudentIds(draft.selectedStudentIds.map(String));
          if (Array.isArray(draft.questions) && draft.questions.length) {
            setQuestions(draft.questions.map((question) => ({
              ...question,
              questionImageFile: null,
            })));
          }
          if (draft.hadQuestionPaper) {
            setMessage("Your test draft was restored. Please select the question paper file again.");
            setMessageType("error");
          } else {
            setMessage("Your unfinished test draft was restored.");
            setMessageType("success");
          }
        }
      }
    } catch (error) {
      console.error("Unable to restore Test Maker draft:", error);
    } finally {
      setDraftReady(true);
    }
  }, []);

  // Save the form after every edit. This protects against tab reloads and
  // mobile browsers unloading a background tab. The draft stays on this device.
  useEffect(() => {
    if (!draftReady || editingTestId) return;
    const draft = {
      title, subjectId, grade, description, teacherName, assessmentType,
      testMode, duration, passingMarks, startDate, endDate,
      allowMultipleAttempts, maxAttempts, shuffleQuestions, shuffleOptions,
      resultRelease, testStatus, selectedStudentIds, questions,
      hadQuestionPaper: Boolean(questionPaper),
    };
    try {
      localStorage.setItem(TEST_MAKER_DRAFT_KEY, JSON.stringify(draft));
    } catch (error) {
      console.error("Unable to save Test Maker draft:", error);
      setMessage("Draft could not be saved on this device. Please keep a backup of your questions.");
      setMessageType("error");
    }
  }, [draftReady, title, subjectId, grade, description, teacherName,
      assessmentType, testMode, duration, passingMarks, startDate, endDate,
      allowMultipleAttempts, maxAttempts, shuffleQuestions, shuffleOptions,
      resultRelease, testStatus, selectedStudentIds, questions, questionPaper, editingTestId]);

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

  function toDateTimeLocal(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const pad = (number) => String(number).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function mapDatabaseQuestion(row, answerKey = {}) {
    const question = createQuestion(row.question_type || "mcq");
    const answer = answerKey.correct_answer || {};
    const storedOptions = row.options;

    question.dbQuestionId = row.id;
    question.question_text = row.question_text || "";
    question.marks = row.marks ?? 1;
    question.negative_marks = row.negative_marks ?? 0;
    question.questionImagePath = row.settings?.question_image_path || null;

    if (row.question_type === "mcq" || row.question_type === "multiple_select") {
      const optionList = Array.isArray(storedOptions) ? storedOptions : [];
      question.options = optionList.length
        ? optionList.map((option, index) => ({
            id: String(option.id || String.fromCharCode(65 + index)),
            text: option.text || "",
          }))
        : createQuestion(row.question_type).options;
      question.correct_option = answer.option_id || "A";
      question.correct_options = Array.isArray(answer.option_ids) ? answer.option_ids : [];
    }

    if (row.question_type === "fill_blank" || row.question_type === "one_word") {
      question.accepted_answers = Array.isArray(answer.accepted_answers)
        ? answer.accepted_answers.join("\n")
        : "";
    }

    if (row.question_type === "true_false") {
      question.true_false_answer = String(answer.value ?? true);
    }

    if (row.question_type === "matching") {
      const pairs = storedOptions?.pairs || answer.pairs || [];
      question.pairs = pairs.length ? pairs.map((pair) => ({
        left: pair.left || "",
        right: pair.right || "",
      })) : [{ left: "", right: "" }, { left: "", right: "" }];
    }

    if (row.question_type === "ordering") {
      const items = storedOptions?.items || answer.correct_order || [];
      question.ordering_items = items.length ? [...items] : ["", ""];
    }

    if (["short_answer", "long_answer", "diagram_label"].includes(row.question_type)) {
      question.model_answer = answer.model_answer || "";
      question.keywords = Array.isArray(answer.keywords) ? answer.keywords.join("\n") : "";
    }

    return question;
  }

  async function fetchTestQuestionData(testId) {
    const { data: questionRows, error: questionError } = await supabase
      .from("test_questions")
      .select("*")
      .eq("test_id", testId)
      .order("question_order", { ascending: true });
    if (questionError) throw questionError;

    const ids = (questionRows || []).map((question) => question.id);
    let keyRows = [];
    if (ids.length) {
      const { data, error } = await supabase
        .from("test_question_keys")
        .select("question_id, correct_answer, explanation")
        .in("question_id", ids);
      if (error) throw error;
      keyRows = data || [];
    }

    const keyMap = new Map(keyRows.map((row) => [String(row.question_id), row]));
    return (questionRows || []).map((row) => mapDatabaseQuestion(row, keyMap.get(String(row.id))));
  }

  async function loadTestIntoForm(test, duplicate = false) {
    setBusyTestId(test.id);
    setMessage("");
    try {
      if (!duplicate) {
        // Editing is allowed only before the first student attempt. This protects
        // submitted answers from being matched against changed questions.
        const { count, error: attemptError } = await supabase
          .from("test_attempts")
          .select("id", { count: "exact", head: true })
          .eq("test_id", test.id);
        if (!attemptError && (count || 0) > 0) {
          throw new Error("This test already has student attempts, so editing is locked to protect their answers and results. You can duplicate it to make a revised version.");
        }
        // Some projects restrict direct teacher reads of test_attempts. If so,
        // allow the form to load; the SECURITY DEFINER update function performs
        // the authoritative attempt check again before changing any records.
        if (attemptError) {
          console.info("Attempt count is protected by RLS; the database update function will verify it on save.");
        }
      }

      const [loadedQuestions, assignmentResult] = await Promise.all([
        fetchTestQuestionData(test.id),
        supabase.from("test_assignments").select("student_id").eq("test_id", test.id),
      ]);
      if (assignmentResult.error) throw assignmentResult.error;
      if (!loadedQuestions.length) throw new Error("No saved questions were found for this test.");

      setTitle(duplicate ? `${test.title} (Copy)` : test.title || "");
      setSubjectId(String(test.subject_id || ""));
      setGrade(test.grade || "");
      setDescription(test.description || "");
      setTeacherName(test.teacher_name || "");
      setAssessmentType(test.assessment_type || "practice");
      setTestMode(test.test_mode || "online");
      setDuration(test.duration_minutes ?? 30);
      setPassingMarks(test.passing_marks ?? "");
      setStartDate(toDateTimeLocal(test.scheduled_start));
      setEndDate(toDateTimeLocal(test.scheduled_end));
      setAllowMultipleAttempts(Boolean(test.allow_multiple_attempts));
      setMaxAttempts(test.max_attempts || 2);
      setShuffleQuestions(Boolean(test.shuffle_questions));
      setShuffleOptions(Boolean(test.shuffle_options));
      setResultRelease(test.result_release || "after_review");
      setTestStatus(duplicate ? "draft" : (test.status || "draft"));
      setSelectedStudentIds((assignmentResult.data || []).map((row) => String(row.student_id)));
      setQuestions(loadedQuestions);
      setQuestionPaper(null);
      setExistingQuestionPaperPath(test.question_paper_path || "");
      setEditingTestId(duplicate ? null : test.id);
      setDuplicatingTest(Boolean(duplicate));
      setMessage(duplicate
        ? "A copy has been loaded. Review it and save it as a new test."
        : "Test loaded for editing. Save your changes when ready.");
      setMessageType("success");
      try { localStorage.removeItem(TEST_MAKER_DRAFT_KEY); } catch {}
      document.querySelector(".test-maker")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      setMessage(error.message || "Unable to open this test.");
      setMessageType("error");
    } finally {
      setBusyTestId(null);
    }
  }

  async function viewTestPaper(test) {
    setBusyTestId(test.id);
    setMessage("");
    try {
      const [questionRowsResult, assignmentResult] = await Promise.all([
        supabase.from("test_questions").select("*").eq("test_id", test.id).order("question_order", { ascending: true }),
        supabase.from("test_assignments").select("student_id").eq("test_id", test.id),
      ]);
      if (questionRowsResult.error) throw questionRowsResult.error;
      if (assignmentResult.error) throw assignmentResult.error;

      const rows = questionRowsResult.data || [];
      const ids = rows.map((row) => row.id);
      let keys = [];
      if (ids.length) {
        const { data, error } = await supabase.from("test_question_keys")
          .select("question_id, correct_answer").in("question_id", ids);
        if (error) throw error;
        keys = data || [];
      }
      const keyMap = new Map(keys.map((row) => [String(row.question_id), row]));
      const questionsForView = rows.map((row) => ({
        ...mapDatabaseQuestion(row, keyMap.get(String(row.id))),
        id: row.id,
        imageUrl: null,
      }));

      await Promise.all(questionsForView.map(async (question) => {
        if (!question.questionImagePath) return;
        const { data, error } = await supabase.storage.from("test-uploads")
          .createSignedUrl(question.questionImagePath, 60 * 60);
        if (!error) question.imageUrl = data?.signedUrl || null;
      }));

      let questionPaperUrl = null;
      if (test.question_paper_path) {
        const { data, error } = await supabase.storage.from("test-materials")
          .createSignedUrl(test.question_paper_path, 60 * 60);
        if (!error) questionPaperUrl = data?.signedUrl || null;
      }

      setViewingTest({
        test,
        questions: questionsForView,
        questionPaperUrl,
        assignedCount: (assignmentResult.data || []).length,
      });
    } catch (error) {
      setMessage(error.message || "Unable to load the question paper.");
      setMessageType("error");
    } finally {
      setBusyTestId(null);
    }
  }

  function getAnswerPreview(question) {
    if (question.question_type === "mcq") return question.correct_option || "Not set";
    if (question.question_type === "multiple_select") return (question.correct_options || []).join(", ") || "Not set";
    if (question.question_type === "fill_blank" || question.question_type === "one_word") return question.accepted_answers || "Not set";
    if (question.question_type === "true_false") return question.true_false_answer === "true" ? "True" : "False";
    if (question.question_type === "matching") return (question.pairs || []).map((pair) => `${pair.left} → ${pair.right}`).join("; ");
    if (question.question_type === "ordering") return (question.ordering_items || []).join(" → ");
    return question.model_answer || "Not set";
  }

  function resetTestForm() {
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
    setExistingQuestionPaperPath("");
    setQuestions([createQuestion("mcq")]);
    setEditingTestId(null);
    setDuplicatingTest(false);
    const paperInput = document.getElementById("test-question-paper");
    if (paperInput) paperInput.value = "";
    try { localStorage.removeItem(TEST_MAKER_DRAFT_KEY); } catch {}
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
          questionImageFile: question.questionImageFile || null,
          questionImagePath: question.questionImagePath || null,
          dbQuestionId: question.dbQuestionId || null,
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
      settings: { question_image_path: question.questionImagePath || null },
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

  async function uploadQuestionImage(file, testId, userId, questionId) {
    if (!file) return null;
    if (!file.type.startsWith("image/")) throw new Error("Question attachments must be image files.");
    if (file.size > 8 * 1024 * 1024) throw new Error("Each question image must be under 8 MB.");
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${userId}/${testId}/questions/${questionId}-${crypto.randomUUID()}-${safeName}`;
    const { error } = await supabase.storage.from("test-uploads").upload(path, file, { cacheControl: "3600", upsert: false });
    if (error) throw error;
    return path;
  }

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
  // UPDATE EXISTING TEST
  // =====================================

  async function updateExistingTest() {
    setMessage("");
    setSaving(true);
    const newlyUploadedPaths = [];
    try {
      if (!title.trim()) throw new Error("Enter a test title.");
      if (!subjectId) throw new Error("Select a subject.");
      if (!teacherName.trim()) throw new Error("Enter the teacher's name.");
      if (selectedStudentIds.length === 0) throw new Error("Select at least one student.");
      if (!questions.length) throw new Error("Add at least one question.");
      if (assessmentType === "exam" && Number(duration) <= 0) throw new Error("Examination Mode requires a timer.");
      if (assessmentType === "practice" && Number(duration) < 0) throw new Error("Duration cannot be negative.");
      if (startDate && endDate && new Date(endDate) <= new Date(startDate)) throw new Error("Test end time must be later than start time.");
      if (passingMarks !== "" && (Number(passingMarks) < 0 || Number(passingMarks) > totalMarks)) throw new Error("Passing marks cannot exceed total marks.");
      if (questionPaper && questionPaper.size > 50 * 1024 * 1024) throw new Error("Question paper must be below 50 MB.");
      const validationError = validateQuestions();
      if (validationError) throw new Error(validationError);

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error("Please log in again.");

      let questionPaperPath = existingQuestionPaperPath || null;
      if (questionPaper) {
        questionPaperPath = await uploadQuestionPaper(questionPaper, editingTestId);
        newlyUploadedPaths.push({ bucket: "test-materials", path: questionPaperPath });
      }

      const questionPayloads = [];
      for (let index = 0; index < questions.length; index += 1) {
        const question = questions[index];
        let imagePath = question.questionImagePath || null;
        if (question.questionImageFile) {
          imagePath = await uploadQuestionImage(question.questionImageFile, editingTestId, user.id, question.id);
          newlyUploadedPaths.push({ bucket: "test-uploads", path: imagePath });
        }
        const data = buildQuestionData({ ...question, questionImagePath: imagePath }, index);
        questionPayloads.push({
          question_type: data.question_type,
          question_text: data.question_text,
          options: data.options,
          marks: data.marks,
          negative_marks: data.negative_marks,
          question_order: data.question_order,
          settings: data.settings,
          correct_answer: data.correct_answer,
        });
      }

      const testPayload = {
        title: title.trim(),
        subject_id: subjectId,
        grade: grade.trim() || null,
        description: description.trim() || null,
        assessment_type: assessmentType,
        test_mode: testMode,
        duration_minutes: Number(duration),
        scheduled_start: startDate ? new Date(startDate).toISOString() : null,
        scheduled_end: endDate ? new Date(endDate).toISOString() : null,
        total_marks: totalMarks,
        passing_marks: passingMarks === "" ? null : Number(passingMarks),
        allow_multiple_attempts: allowMultipleAttempts,
        max_attempts: allowMultipleAttempts ? Number(maxAttempts) : 1,
        shuffle_questions: shuffleQuestions,
        shuffle_options: shuffleOptions,
        result_release: resultRelease,
        status: testStatus,
        teacher_name: teacherName.trim(),
        question_paper_path: questionPaperPath,
      };

      const { data, error } = await supabase.rpc("teacher_update_test", {
        p_test_id: editingTestId,
        p_test: testPayload,
        p_questions: questionPayloads,
        p_student_ids: selectedStudentIds,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setExistingQuestionPaperPath(questionPaperPath || "");
      resetTestForm();
      await loadData();
      setMessage("Test updated successfully! 🎉");
      setMessageType("success");
    } catch (error) {
      console.error("Update test error:", error);
      await Promise.all(newlyUploadedPaths.map(({ bucket, path }) =>
        supabase.storage.from(bucket).remove([path])
      ));
      setMessage(error.message || "Unable to update test.");
      setMessageType("error");
    } finally {
      setSaving(false);
    }
  }

  async function copyQuestionImage(sourcePath, testId, userId, questionId) {
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from("test-uploads")
      .download(sourcePath);
    if (downloadError) throw downloadError;
    const extension = fileBlob.type?.split("/")[1] || "png";
    const path = `${userId}/${testId}/questions/${questionId}-${crypto.randomUUID()}-copy.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("test-uploads")
      .upload(path, fileBlob, { cacheControl: "3600", upsert: false, contentType: fileBlob.type || "image/png" });
    if (uploadError) throw uploadError;
    return path;
  }

  async function copyQuestionPaper(sourcePath, testId) {
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from("test-materials")
      .download(sourcePath);
    if (downloadError) throw downloadError;
    const extension = sourcePath.split(".").pop()?.split("?")[0] || "file";
    const path = `${testId}/${crypto.randomUUID()}-copy.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("test-materials")
      .upload(path, fileBlob, { cacheControl: "3600", upsert: false, contentType: fileBlob.type || undefined });
    if (uploadError) throw uploadError;
    return path;
  }

  // =====================================
  // CREATE TEST
  // =====================================

  async function createTest(event) {
    event.preventDefault();
    if (editingTestId) {
      await updateExistingTest();
      return;
    }

    setMessage("");
    setSaving(true);

    let createdTestId = null;
    let uploadedPaperPath = null;
    const uploadedQuestionImagePaths = [];

    try {
      if (!title.trim()) {
        throw new Error("Enter a test title.");
      }

      if (!subjectId) {
        throw new Error("Select a subject.");
      }

      if (!teacherName.trim()) {
        throw new Error("Enter the teacher's name.");
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
      } else if (duplicatingTest && existingQuestionPaperPath) {
        uploadedPaperPath = await copyQuestionPaper(existingQuestionPaperPath, createdTestId);
      }

      if (uploadedPaperPath) {
        const { error: paperUpdateError } =
          await supabase
            .from("tests")
            .update({
              question_paper_path: uploadedPaperPath,
            })
            .eq("id", createdTestId);

        if (paperUpdateError) throw paperUpdateError;
      }

      // Upload optional image attachments for questions.
      for (const question of questions) {
        if (question.questionImageFile) {
          question.questionImagePath = await uploadQuestionImage(
            question.questionImageFile, createdTestId, user.id, question.id
          );
          uploadedQuestionImagePaths.push(question.questionImagePath);
        } else if (duplicatingTest && question.questionImagePath) {
          question.questionImagePath = await copyQuestionImage(
            question.questionImagePath, createdTestId, user.id, question.id
          );
          uploadedQuestionImagePaths.push(question.questionImagePath);
        }
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

      // The test and assignments were saved successfully; clear this draft.
      try { localStorage.removeItem(TEST_MAKER_DRAFT_KEY); } catch (storageError) {
        console.warn("Could not clear saved Test Maker draft:", storageError);
      }

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
      setExistingQuestionPaperPath("");
      setEditingTestId(null);
      setDuplicatingTest(false);
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
      if (uploadedQuestionImagePaths.length) {
        await supabase.storage.from("test-uploads").remove(uploadedQuestionImagePaths);
      }

      setMessage(
        error.message || "Unable to create test."
      );

      setMessageType("error");

    } finally {
      setSaving(false);
    }
  }

  async function deleteTest(test) {
    if (!window.confirm(`Delete "${test.title}" and all its questions, submissions and responses? This cannot be undone.`)) return;
    setMessage("");
    try {
      const { data, error } = await supabase.functions.invoke("delete-test", { body: { test_id: test.id } });
      if (error) {
        let detail = error.message;
        try { const payload = await error.context?.json(); detail = payload?.error || detail; } catch {}
        throw new Error(detail);
      }
      if (data?.error) throw new Error(data.error);
      setMessage("Test and its related records were deleted.");
      setMessageType("success");
      await loadData();
    } catch (err) {
      setMessage(err.message || "Unable to delete this test.");
      setMessageType("error");
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

        <div className="tm-field">
          <label>Question image (optional)</label>
          <input
            type="file"
            accept="image/*"
            onChange={(event) => updateQuestion(index, "questionImageFile", event.target.files?.[0] || null)}
          />
          {question.questionImageFile && (
            <small>Selected: {question.questionImageFile.name}</small>
          )}
          {question.questionImagePath && !question.questionImageFile && (
            <small>Previously uploaded image attached.</small>
          )}
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
          <h3>{editingTestId ? "✏️ Edit Existing Test" : "✏️ Create New Test"}</h3>
          <p>{editingTestId ? "Update this test. Editing is available only before the first student attempt." : "Enter test details and prepare your questions."}</p>
          {editingTestId && (
            <button type="button" className="tm-secondary-button tm-cancel-edit" onClick={resetTestForm}>
              Cancel Editing
            </button>
          )}
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
              {existingQuestionPaperPath && !questionPaper ? " The currently saved paper will be kept unless you select a replacement." : ""}
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
            ? (editingTestId ? "Saving Changes..." : "Creating Test...")
            : editingTestId
              ? "💾 Save Changes"
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
                <div className="tm-test-actions">
                  <button
                    type="button"
                    className="tm-secondary-button"
                    disabled={busyTestId === test.id}
                    onClick={() => viewTestPaper(test)}
                  >
                    {busyTestId === test.id ? "Loading..." : "👁 View Paper"}
                  </button>
                  <button
                    type="button"
                    className="tm-secondary-button"
                    disabled={busyTestId === test.id}
                    onClick={() => loadTestIntoForm(test, false)}
                  >
                    ✏️ Edit
                  </button>
                  <button
                    type="button"
                    className="tm-secondary-button"
                    disabled={busyTestId === test.id}
                    onClick={() => loadTestIntoForm(test, true)}
                  >
                    📄 Duplicate
                  </button>
                  <button
                    type="button"
                    className="tm-delete-question"
                    onClick={() => deleteTest(test)}
                  >
                    🗑 Delete Test
                  </button>
                </div>

              </article>

            ))}

          </div>

        )}

      </div>

      {viewingTest && (
        <div className="tm-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setViewingTest(null);
        }}>
          <section className="tm-paper-modal" role="dialog" aria-modal="true" aria-labelledby="tm-paper-title">
            <div className="tm-paper-modal-heading">
              <div>
                <span className={`tm-status tm-${viewingTest.test.status}`}>{viewingTest.test.status}</span>
                <h2 id="tm-paper-title">{viewingTest.test.title}</h2>
                <p>{getSubjectName(viewingTest.test.subject_id)} · {viewingTest.questions.length} questions · {viewingTest.test.total_marks} marks</p>
              </div>
              <button type="button" className="tm-paper-close" onClick={() => setViewingTest(null)} aria-label="Close question paper">✕</button>
            </div>

            {viewingTest.questionPaperUrl && (
              <p className="tm-paper-download">
                📎 <a href={viewingTest.questionPaperUrl} target="_blank" rel="noreferrer">Open attached question paper</a>
              </p>
            )}

            <div className="tm-paper-question-list">
              {viewingTest.questions.map((question, index) => (
                <article className="tm-paper-question" key={question.id}>
                  <div className="tm-paper-question-topline">
                    <strong>Question {index + 1}</strong>
                    <span>{question.marks} marks{Number(question.negative_marks) > 0 ? ` · −${question.negative_marks} for incorrect answer` : ""}</span>
                  </div>
                  <p className="tm-paper-question-text">{question.question_text}</p>
                  {question.imageUrl && <img className="tm-paper-question-image" src={question.imageUrl} alt={`Question ${index + 1}`} />}
                  {(question.question_type === "mcq" || question.question_type === "multiple_select") && (
                    <ol className="tm-paper-options" type="A">
                      {question.options.map((option) => <li key={option.id}>{option.text}</li>)}
                    </ol>
                  )}
                  {question.question_type === "matching" && (
                    <div className="tm-paper-answer-lines">{question.pairs.map((pair, pairIndex) => <p key={pairIndex}>{pair.left} <span>↔</span> {pair.right}</p>)}</div>
                  )}
                  {question.question_type === "ordering" && (
                    <ol className="tm-paper-options">{question.ordering_items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ol>
                  )}
                  <details className="tm-paper-answer">
                    <summary>Show teacher answer key</summary>
                    <p>{getAnswerPreview(question)}</p>
                  </details>
                </article>
              ))}
            </div>
            <div className="tm-paper-modal-footer">
              <span>Assigned to {viewingTest.assignedCount} student(s)</span>
              <button type="button" className="tm-secondary-button" onClick={() => setViewingTest(null)}>Close</button>
            </div>
          </section>
        </div>
      )}

    </section>
  );
}

export default TestMaker;
