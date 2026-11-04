import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export default function LeagueManagement() {
  const [students, setStudents] = useState([]);
  const [leagueData, setLeagueData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const monthStart = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  })();

  function getLeague(coins) {
    if (coins >= 300) return "Diamond";
    if (coins >= 200) return "Gold";
    if (coins >= 100) return "Silver";
    return "Bronze";
  }

  function getProgress(coins) {
    if (coins >= 300) {
      return {
        next: null,
        remaining: 0,
        percentage: 100,
      };
    }

    const next =
      coins < 100 ? 100 :
      coins < 200 ? 200 : 300;

    return {
      next,
      remaining: next - coins,
      percentage: Math.min((coins / next) * 100, 100),
    };
  }

  useEffect(() => {
    refreshLeagues();
  }, []);

  async function refreshLeagues() {
    setLoading(true);
    setMessage("");

    const [studentResult, transactionResult] = await Promise.all([
      supabase
        .from("students")
        .select("id, full_name")
        .order("full_name"),

      supabase
        .from("coin_transactions")
        .select("student_id, transaction_type, coins")
        .eq("month_start", monthStart),
    ]);

    if (studentResult.error || transactionResult.error) {
      setMessage(
        studentResult.error?.message ||
        transactionResult.error?.message
      );
      setLoading(false);
      return;
    }

    const studentList = studentResult.data || [];
    const transactions = transactionResult.data || [];

    const balances = {};

    studentList.forEach((student) => {
      balances[student.id] = 0;
    });

    transactions.forEach((item) => {
      const amount =
        item.transaction_type === "Earned"
          ? Number(item.coins)
          : -Number(item.coins);

      balances[item.student_id] =
        (balances[item.student_id] || 0) + amount;
    });

    const records = studentList.map((student) => {
      const coins = Math.max(
        0,
        balances[student.id] || 0
      );

      return {
        student_id: student.id,
        month_start: monthStart,
        total_coins: coins,
        league: getLeague(coins),
      };
    });

    if (records.length > 0) {
      const { error } = await supabase
        .from("student_leagues")
        .upsert(records, {
          onConflict: "student_id,month_start",
        });

      if (error) {
        setMessage(error.message);
        setLoading(false);
        return;
      }
    }

    const displayData = studentList.map((student) => {
      const coins = Math.max(
        0,
        balances[student.id] || 0
      );

      return {
        ...student,
        coins,
        league: getLeague(coins),
        progress: getProgress(coins),
      };
    });

    const leagueOrder = {
      Diamond: 4,
      Gold: 3,
      Silver: 2,
      Bronze: 1,
    };

    displayData.sort((a, b) => {
      return (
        leagueOrder[b.league] - leagueOrder[a.league] ||
        b.coins - a.coins
      );
    });

    setStudents(studentList);
    setLeagueData(displayData);
    setLoading(false);
    setMessage("Monthly leagues updated successfully!");
  }

  const leagueColors = {
    Bronze: "#B8794B",
    Silver: "#9299A3",
    Gold: "#D49A24",
    Diamond: "#398CCB",
  };

  const leagueEmojis = {
    Bronze: "🥉",
    Silver: "🥈",
    Gold: "🥇",
    Diamond: "💎",
  };

  const styles = {
    container: {
      background: "#fff",
      padding: "24px",
      borderRadius: "16px",
      marginTop: "24px",
      boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
    },
    card: {
      border: "1px solid #eee",
      borderRadius: "12px",
      padding: "18px",
      marginTop: "14px",
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
    progressBackground: {
      height: "9px",
      background: "#eee",
      borderRadius: "10px",
      overflow: "hidden",
      marginTop: "10px",
    },
  };

  return (
    <div style={styles.container}>
      <h2>🏆 Monthly League Management</h2>

      <p style={{ color: "#777" }}>
        Track student progress and monthly league rankings.
      </p>

      <p>
        <strong>Month:</strong>{" "}
        {new Date(monthStart + "T12:00:00").toLocaleDateString(
          undefined,
          { month: "long", year: "numeric" }
        )}
      </p>

      <button
        type="button"
        onClick={refreshLeagues}
        disabled={loading}
        style={styles.button}
      >
        {loading ? "Updating..." : "Refresh Monthly Leagues"}
      </button>

      {message && (
        <p style={{
          color: message.includes("successfully")
            ? "green"
            : "crimson",
        }}>
          {message}
        </p>
      )}

      <hr style={{
        margin: "25px 0",
        border: "none",
        borderTop: "1px solid #eee",
      }} />

      <h3>League Requirements</h3>

      <div style={{ display: "grid", gap: "10px" }}>
        {[
          ["🥉 Bronze", "0–99 coins"],
          ["🥈 Silver", "100–199 coins"],
          ["🥇 Gold", "200–299 coins"],
          ["💎 Diamond", "300+ coins"],
        ].map(([name, range]) => (
          <div
            key={name}
            style={{
              padding: "12px",
              background: "#f8f8fb",
              borderRadius: "8px",
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <strong>{name}</strong>
            <span>{range}</span>
          </div>
        ))}
      </div>

      <hr style={{
        margin: "25px 0",
        border: "none",
        borderTop: "1px solid #eee",
      }} />

      <h3>Monthly Student Rankings</h3>

      {loading ? (
        <p>Calculating leagues...</p>
      ) : leagueData.length === 0 ? (
        <p>No students found.</p>
      ) : (
        leagueData.map((student, index) => {
          const color = leagueColors[student.league];

          return (
            <div key={student.id} style={styles.card}>
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "10px",
                flexWrap: "wrap",
              }}>
                <div>
                  <strong>
                    #{index + 1} {student.full_name}
                  </strong>
                  <p style={{
                    margin: "6px 0",
                    color: color,
                    fontWeight: "700",
                  }}>
                    {leagueEmojis[student.league]}{" "}
                    {student.league} League
                  </p>
                </div>

                <strong style={{ fontSize: "18px" }}>
                  {student.coins} 🪙
                </strong>
              </div>

              <div style={styles.progressBackground}>
                <div style={{
                  height: "100%",
                  width: `${student.progress.percentage}%`,
                  background: color,
                  borderRadius: "10px",
                  transition: "width 0.3s",
                }} />
              </div>

              <p style={{
                fontSize: "13px",
                color: "#777",
                marginBottom: 0,
              }}>
                {student.progress.next === null
                  ? "Diamond League achieved!"
                  : `${student.progress.remaining} more coins to reach the next league.`}
              </p>
            </div>
          );
        })
      )}
    </div>
  );
}