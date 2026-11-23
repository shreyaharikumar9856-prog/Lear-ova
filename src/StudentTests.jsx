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
