import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import "./StudentLeaderboard.css";

function getMonthStart() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function getMonthLabel(monthStart) {
  const date = new Date(`${monthStart}T12:00:00`);
  return date.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function getLeagueInfo(coins) {
  if (coins >= 300) return { name: "Diamond", icon: "💎", className: "diamond" };
  if (coins >= 200) return { name: "Gold", icon: "🥇", className: "gold" };
  if (coins >= 100) return { name: "Silver", icon: "🥈", className: "silver" };
  return { name: "Bronze", icon: "🥉", className: "bronze" };
}

function getInitials(name) {
  return String(name || "Learner")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase();
}

function rankRows(rows) {
  let previousCoins = null;
  let previousRank = 0;

  return rows.map((row, index) => {
    const coins = Number(row.coins) || 0;
    const rank = previousCoins === coins ? previousRank : index + 1;
    previousCoins = coins;
    previousRank = rank;

    return {
      ...row,
      coins,
      rank,
      leagueInfo: getLeagueInfo(coins),
    };
  });
}

export default function StudentLeaderboard() {
  const [monthStart] = useState(getMonthStart);
  const [rows, setRows] = useState([]);
  const [currentStudentId, setCurrentStudentId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadLeaderboard = useCallback(async ({ quiet = false } = {}) => {
    if (quiet) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError("");

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!authData?.user) {
        throw new Error("Please log in to view the leaderboard.");
      }

      const [studentResult, leaderboardResult] = await Promise.all([
        supabase
          .from("students")
          .select("id")
          .eq("user_id", authData.user.id)
          .maybeSingle(),
        supabase.rpc("get_monthly_leaderboard", {
          p_month_start: monthStart,
        }),
      ]);

      if (studentResult.error) throw studentResult.error;
      if (leaderboardResult.error) throw leaderboardResult.error;

      setCurrentStudentId(studentResult.data?.id ?? null);
      setRows(leaderboardResult.data || []);
    } catch (loadError) {
      console.error("Unable to load Learnova leaderboard:", loadError);
      setError(
        loadError?.message ||
          "The leaderboard could not be loaded. Please try again."
      );
      setRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [monthStart]);

  useEffect(() => {
    loadLeaderboard();
  }, [loadLeaderboard]);

  const rankedRows = useMemo(() => rankRows(rows), [rows]);
  const topThree = rankedRows.slice(0, 3);
  const currentStudent = rankedRows.find(
    (row) => String(row.student_id) === String(currentStudentId)
  );

  if (loading) {
    return (
      <section className="student-leaderboard">
        <div className="sl-state">Loading the leaderboard… 🏆</div>
      </section>
    );
  }

  return (
    <section className="student-leaderboard">
      <header className="sl-header">
        <div>
          <span className="sl-eyebrow">LEARN • GROW • SHINE</span>
          <h2>🏆 Learnova Leaderboard</h2>
          <p>Celebrate your effort and see how far everyone has come.</p>
        </div>
        <button
          type="button"
          className="sl-refresh"
          onClick={() => loadLeaderboard({ quiet: true })}
          disabled={refreshing}
        >
          {refreshing ? "Refreshing…" : "↻ Refresh"}
        </button>
      </header>

      <div className="sl-month-strip">
        <span>📅 Monthly standings</span>
        <strong>{getMonthLabel(monthStart)}</strong>
      </div>

      {error && (
        <div className="sl-error" role="alert">
          <strong>Unable to show the leaderboard.</strong>
          <p>{error}</p>
          <p className="sl-error-help">
            The teacher/admin needs to run the supplied leaderboard SQL setup
            script in Supabase once.
          </p>
          <button
            type="button"
            className="sl-retry"
            onClick={() => loadLeaderboard()}
          >
            Try again
          </button>
        </div>
      )}

      {!error && currentStudent && (
        <div className="sl-your-position">
          <div className="sl-your-position-icon">🌟</div>
          <div>
            <span>Your current position</span>
            <strong>
              {currentStudent.rank === 1
                ? "1st place"
                : currentStudent.rank === 2
                  ? "2nd place"
                  : currentStudent.rank === 3
                    ? "3rd place"
                    : `${currentStudent.rank}th place`}
            </strong>
          </div>
          <div className="sl-your-points">
            <strong>{currentStudent.coins}</strong>
            <span>coins</span>
          </div>
        </div>
      )}

      {!error && topThree.length > 0 && (
        <div className="sl-podium" aria-label="Top three students">
          {topThree.map((student) => (
            <article
              key={student.student_id}
              className={`sl-podium-card sl-podium-${student.rank <= 3 ? student.rank : "other"} ${
                String(student.student_id) === String(currentStudentId)
                  ? "is-you"
                  : ""
              }`}
            >
              <div className="sl-podium-medal">
                {student.rank === 1 ? "👑" : student.rank === 2 ? "🥈" : "🥉"}
              </div>
              <div className="sl-avatar">{getInitials(student.full_name)}</div>
              <strong className="sl-podium-name">
                {student.full_name}
                {String(student.student_id) === String(currentStudentId) && (
                  <span className="sl-you-tag">YOU</span>
                )}
              </strong>
              <span className="sl-podium-rank">Rank #{student.rank}</span>
              <strong className="sl-podium-coins">🪙 {student.coins}</strong>
              <span className={`sl-league-badge ${student.leagueInfo.className}`}>
                {student.leagueInfo.icon} {student.leagueInfo.name}
              </span>
            </article>
          ))}
        </div>
      )}

      {!error && (
        <div className="sl-list-card">
          <div className="sl-list-heading">
            <div>
              <h3>Monthly rankings</h3>
              <p>{rankedRows.length} learners on the board</p>
            </div>
            <span className="sl-sort-note">Highest coins first</span>
          </div>

          {rankedRows.length === 0 ? (
            <div className="sl-state">
              No students are available on the leaderboard yet.
            </div>
          ) : (
            <div className="sl-table-wrap">
              <table className="sl-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Student</th>
                    <th>League</th>
                    <th className="sl-coins-heading">Coins</th>
                  </tr>
                </thead>
                <tbody>
                  {rankedRows.map((student) => {
                    const isYou =
                      String(student.student_id) === String(currentStudentId);

                    return (
                      <tr key={student.student_id} className={isYou ? "sl-current-row" : ""}>
                        <td>
                          <span className={`sl-rank-number ${student.rank <= 3 ? "top-rank" : ""}`}>
                            {student.rank <= 3
                              ? ["🥇", "🥈", "🥉"][student.rank - 1]
                              : `#${student.rank}`}
                          </span>
                        </td>
                        <td>
                          <div className="sl-student-cell">
                            <span className="sl-small-avatar">
                              {getInitials(student.full_name)}
                            </span>
                            <strong>
                              {student.full_name}
                              {isYou && <span className="sl-you-tag">YOU</span>}
                            </strong>
                          </div>
                        </td>
                        <td>
                          <span className={`sl-league-badge ${student.leagueInfo.className}`}>
                            {student.leagueInfo.icon} {student.leagueInfo.name}
                          </span>
                        </td>
                        <td className="sl-coins-cell">{student.coins} 🪙</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {!error && (
        <p className="sl-footer-note">
          Rankings are based on each learner’s net coins earned this month.
          Keep learning, keep trying, and keep shining! ✨
        </p>
      )}
    </section>
  );
}
