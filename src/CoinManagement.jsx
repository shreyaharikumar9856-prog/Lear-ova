import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export default function CoinManagement() {
  const [students, setStudents] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [balances, setBalances] = useState({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [form, setForm] = useState({
    student_id: "",
    transaction_type: "Earned",
    coins: "",
    activity: "Teacher Bonus",
    reason: "",
  });

  const monthStart = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  })();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);

    const [studentResult, transactionResult] = await Promise.all([
      supabase
        .from("students")
        .select("id, full_name")
        .order("full_name"),

      supabase
        .from("coin_transactions")
        .select("*")
        .eq("month_start", monthStart)
        .order("created_at", { ascending: false }),
    ]);

    if (studentResult.error || transactionResult.error) {
      setMessage(
        studentResult.error?.message ||
        transactionResult.error?.message
      );
      setLoading(false);
      return;
    }

    const studentData = studentResult.data || [];
    const transactionData = transactionResult.data || [];

    setStudents(studentData);
    setTransactions(transactionData);

    const calculatedBalances = {};

    studentData.forEach((student) => {
      calculatedBalances[student.id] = 0;
    });

    transactionData.forEach((item) => {
      const current = calculatedBalances[item.student_id] || 0;

      calculatedBalances[item.student_id] =
        current +
        (item.transaction_type === "Earned"
          ? item.coins
          : -item.coins);
    });

    setBalances(calculatedBalances);
    setLoading(false);
  }

  function handleChange(e) {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  }

  async function submitTransaction(e) {
    e.preventDefault();
    setMessage("");

    const coins = Number(form.coins);
    const currentBalance = balances[form.student_id] || 0;

    if (!Number.isInteger(coins) || coins <= 0) {
      setMessage("Enter a valid positive whole number of coins.");
      return;
    }

    if (!form.reason.trim()) {
      setMessage("Please enter a reason for this transaction.");
      return;
    }

    if (
      form.transaction_type === "Deducted" &&
      coins > currentBalance
    ) {
      setMessage(
        `Insufficient balance. The student's current balance is ${currentBalance} coins.`
      );
      return;
    }

    const { error } = await supabase
      .from("coin_transactions")
      .insert({
        student_id: form.student_id,
        transaction_type: form.transaction_type,
        coins,
        activity: form.activity,
        reason: form.reason.trim(),
        month_start: monthStart,
      });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage(
      form.transaction_type === "Earned"
        ? `${coins} coins awarded successfully!`
        : `${coins} coins deducted successfully!`
    );

    setForm({
      student_id: "",
      transaction_type: "Earned",
      coins: "",
      activity: "Teacher Bonus",
      reason: "",
    });

    await loadData();
  }

  function getStudentName(id) {
    return (
      students.find((student) => student.id === id)?.full_name ||
      "Student"
    );
  }

  const styles = {
    container: {
      background: "#fff",
      padding: "24px",
      borderRadius: "16px",
      marginTop: "24px",
      boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
    },
    input: {
      width: "100%",
      padding: "12px",
      border: "1px solid #ddd",
      borderRadius: "8px",
      boxSizing: "border-box",
      marginTop: "6px",
      fontSize: "14px",
    },
    field: {
      marginBottom: "16px",
    },
    button: {
      background: "#6658c7",
      color: "#fff",
      border: "none",
      padding: "12px 20px",
      borderRadius: "8px",
      cursor: "pointer",
      fontWeight: "600",
    },
    card: {
      border: "1px solid #eee",
      padding: "16px",
      borderRadius: "12px",
      marginTop: "12px",
    },
  };

  return (
    <div style={styles.container}>
      <h2>🏆 Learnova Coin Management</h2>

      <p style={{ color: "#777" }}>
        Award coins and manage student deductions.
      </p>

      {message && (
        <p style={{
          color:
            message.includes("successfully")
              ? "green"
              : "crimson",
        }}>
          {message}
        </p>
      )}

      <h3>Award or Deduct Coins</h3>

      <form onSubmit={submitTransaction}>
        <div style={styles.field}>
          <label>Select Student *</label>
          <select
            name="student_id"
            value={form.student_id}
            onChange={handleChange}
            required
            style={styles.input}
          >
            <option value="">Choose a student</option>

            {students.map((student) => (
              <option key={student.id} value={student.id}>
                {student.full_name}
              </option>
            ))}
          </select>
        </div>

        {form.student_id && (
          <p>
            Current monthly balance:{" "}
            <strong>
              {balances[form.student_id] || 0} coins
            </strong>
          </p>
        )}

        <div style={styles.field}>
          <label>Transaction Type *</label>
          <select
            name="transaction_type"
            value={form.transaction_type}
            onChange={handleChange}
            style={styles.input}
          >
            <option value="Earned">Award Coins (+)</option>
            <option value="Deducted">Deduct Coins (-)</option>
          </select>
        </div>

        <div style={styles.field}>
          <label>Activity *</label>
          <select
            name="activity"
            value={form.activity}
            onChange={handleChange}
            style={styles.input}
          >
            <option value="Teacher Bonus">Teacher Bonus</option>
            <option value="Class Violation">Class Violation</option>
            <option value="Attendance">Attendance</option>
            <option value="Homework">Homework</option>
            <option value="Test">Test Performance</option>
            <option value="Participation">Class Participation</option>
            <option value="Other">Other</option>
          </select>
        </div>

        <div style={styles.field}>
          <label>Number of Coins *</label>
          <input
            type="number"
            name="coins"
            min="1"
            step="1"
            value={form.coins}
            onChange={handleChange}
            placeholder="Enter coins"
            required
            style={styles.input}
          />
        </div>

        <div style={styles.field}>
          <label>Reason *</label>
          <textarea
            name="reason"
            value={form.reason}
            onChange={handleChange}
            placeholder="Explain why coins are awarded or deducted..."
            rows="3"
            required
            style={styles.input}
          />
        </div>

        <button type="submit" style={styles.button}>
          Submit Transaction
        </button>
      </form>

      <hr style={{
        margin: "28px 0",
        border: "none",
        borderTop: "1px solid #eee",
      }} />

      <h3>Monthly Student Balances</h3>

      {loading ? (
        <p>Loading...</p>
      ) : (
        students.map((student) => (
          <div key={student.id} style={styles.card}>
            <strong>{student.full_name}</strong>
            <p>
              Monthly Coins:{" "}
              <strong>
                {balances[student.id] || 0}
              </strong>
            </p>
          </div>
        ))
      )}

      <hr style={{
        margin: "28px 0",
        border: "none",
        borderTop: "1px solid #eee",
      }} />

      <h3>Recent Coin Transactions</h3>

      {transactions.length === 0 ? (
        <p style={{ color: "#777" }}>
          No transactions recorded this month.
        </p>
      ) : (
        transactions.map((item) => (
          <div key={item.id} style={styles.card}>
            <strong>{getStudentName(item.student_id)}</strong>

            <p style={{
              color:
                item.transaction_type === "Earned"
                  ? "green"
                  : "crimson",
              fontWeight: "600",
            }}>
              {item.transaction_type === "Earned" ? "+" : "-"}
              {item.coins} coins
            </p>

            <p>Activity: {item.activity}</p>
            <p>Reason: {item.reason}</p>

            <small style={{ color: "#999" }}>
              {new Date(item.created_at).toLocaleString()}
            </small>
          </div>
        ))
      )}
    </div>
  );
}