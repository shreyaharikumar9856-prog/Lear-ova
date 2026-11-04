import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

function TeacherSubjectManagement() {
  const [students, setStudents] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState("");
  const [assignedSubjects, setAssignedSubjects] = useState([]);
  const [selectedSubjects, setSelectedSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function loadInitialData() {
    setLoading(true);
    setMessage("");

    try {
      const [studentResult, subjectResult] = await Promise.all([
        supabase
          .from("students")
          .select("id, full_name")
          .order("full_name"),

        supabase
          .from("subjects")
          .select("id, subject_name, description, subject_icon")
          .order("subject_name"),
      ]);

      if (studentResult.error) throw studentResult.error;
      if (subjectResult.error) throw subjectResult.error;

      setStudents(studentResult.data || []);
      setSubjects(subjectResult.data || []);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadStudentSubjects(studentId) {
    if (!studentId) {
      setAssignedSubjects([]);
      setSelectedSubjects([]);
      return;
    }

    setMessage("");

    const { data, error } = await supabase
      .from("student_subjects")
      .select("subject_id")
      .eq("student_id", studentId);

    if (error) {
      setMessage(error.message);
      return;
    }

    const ids = (data || []).map((item) => item.subject_id);

    setAssignedSubjects(ids);
    setSelectedSubjects(ids);
  }

  useEffect(() => {
    loadInitialData();
  }, []);

  function toggleSubject(subjectId) {
    setSelectedSubjects((previous) =>
      previous.includes(subjectId)
        ? previous.filter((id) => id !== subjectId)
        : [...previous, subjectId]
    );
  }

  async function saveAssignments() {
    if (!selectedStudent) {
      setMessage("Please select a student.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const toAdd = selectedSubjects.filter(
        (id) => !assignedSubjects.includes(id)
      );

      const toRemove = assignedSubjects.filter(
        (id) => !selectedSubjects.includes(id)
      );

      if (toAdd.length > 0) {
        const { error } = await supabase
          .from("student_subjects")
          .insert(
            toAdd.map((subjectId) => ({
              student_id: selectedStudent,
              subject_id: subjectId,
            }))
          );

        if (error) throw error;
      }

      for (const subjectId of toRemove) {
        const { error } = await supabase
          .from("student_subjects")
          .delete()
          .eq("student_id", selectedStudent)
          .eq("subject_id", subjectId);

        if (error) throw error;
      }

      await loadStudentSubjects(selectedStudent);

      setMessage("Subjects updated successfully! ✅");
    } catch (error) {
      setMessage(`Unable to update subjects: ${error.message}`);
      await loadStudentSubjects(selectedStudent);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p>Loading subject management...</p>;
  }

  return (
    <section className="teacher-subject-management">
      <h2>📚 Subject Management</h2>
      <p>Assign and manage subjects for individual students.</p>

      {message && (
        <p role="status">{message}</p>
      )}

      <label htmlFor="subject-student">
        <strong>Select Student</strong>
      </label>

      <select
        id="subject-student"
        value={selectedStudent}
        onChange={async (event) => {
          const id = event.target.value;
          setSelectedStudent(id);
          await loadStudentSubjects(id);
        }}
      >
        <option value="">Choose a student</option>

        {students.map((student) => (
          <option key={student.id} value={student.id}>
            {student.full_name}
          </option>
        ))}
      </select>

      {selectedStudent && (
        <>
          <h3>Available Subjects</h3>

          {subjects.length === 0 ? (
            <p>No subjects available.</p>
          ) : (
            <div className="teacher-subject-options">
              {subjects.map((subject) => (
                <label
                  key={subject.id}
                  className="teacher-subject-option"
                >
                  <input
                    type="checkbox"
                    checked={selectedSubjects.includes(subject.id)}
                    onChange={() => toggleSubject(subject.id)}
                  />

                  <span>
                    {subject.subject_icon || "📚"}
                    {" "}
                    {subject.subject_name}
                  </span>
                </label>
              ))}
            </div>
          )}

          <p>
            <strong>
              {selectedSubjects.length} subjects selected
            </strong>
          </p>

          <button
            type="button"
            onClick={saveAssignments}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save Subject Assignments"}
          </button>
        </>
      )}
    </section>
  );
}

export default TeacherSubjectManagement;