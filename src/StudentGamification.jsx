import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export default function StudentGamification() {
  const [student, setStudent] = useState(null);
  const [league, setLeague] = useState(null);
  const [coins, setCoins] = useState(0);
  const [transactions, setTransactions] = useState([]);
  const [achievements, setAchievements] = useState([]);
  const [avatars, setAvatars] = useState([]);
  const [avatarCatalog, setAvatarCatalog] = useState([]);
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectingAvatar, setSelectingAvatar] = useState(false);
  const [message, setMessage] = useState("");
  const [rewardType, setRewardType] = useState("");
  const [rewardDetails, setRewardDetails] = useState("");

  const monthStart = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  })();

  const leagueInfo = {
    Bronze: { emoji: "🥉", color: "#B8794B", next: 100 },
    Silver: { emoji: "🥈", color: "#9299A3", next: 200 },
    Gold: { emoji: "🥇", color: "#D49A24", next: 300 },
    Diamond: { emoji: "💎", color: "#398CCB", next: null },
  };

  const leagueOrder = {
    Silver: 1,
    Gold: 2,
    Diamond: 3,
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    setLoading(true);
    setMessage("");

    const { data: authData, error: authError } =
      await supabase.auth.getUser();

    if (authError || !authData.user) {
      setMessage("Please log in to view your rewards.");
      setLoading(false);
      return;
    }

    const { data: studentData, error: studentError } =
      await supabase
        .from("students")
        .select("id, full_name")
        .eq("user_id", authData.user.id)
        .maybeSingle();

    if (studentError || !studentData) {
      setMessage(
        studentError?.message ||
        "Your student profile could not be found."
      );
      setLoading(false);
      return;
    }

    setStudent(studentData);

    const [
      transactionResult,
      leagueResult,
      achievementResult,
      avatarResult,
      claimResult,
      avatarCatalogResult,
    ] = await Promise.all([
      supabase
        .from("coin_transactions")
        .select("*")
        .eq("student_id", studentData.id)
        .eq("month_start", monthStart)
        .order("created_at", { ascending: false }),

      supabase
        .from("student_leagues")
        .select("*")
        .eq("student_id", studentData.id)
        .eq("month_start", monthStart)
        .maybeSingle(),

      supabase
        .from("student_achievements")
        .select("*")
        .eq("student_id", studentData.id)
        .order("earned_at", { ascending: false }),

      supabase
        .from("student_avatars")
        .select("*, avatars(*)")
        .eq("student_id", studentData.id),

      supabase
        .from("reward_claims")
        .select("*")
        .eq("student_id", studentData.id)
        .order("created_at", { ascending: false }),

      supabase
        .from("avatars")
        .select("*"),
    ]);

    const results = [
      transactionResult,
      leagueResult,
      achievementResult,
      avatarResult,
      claimResult,
      avatarCatalogResult,
    ];

    const failed = results.find((result) => result.error);

    if (failed) {
      setMessage(failed.error.message);
      setLoading(false);
      return;
    }

    const transactionData = transactionResult.data || [];

    const balance = transactionData.reduce(
      (total, item) =>
        total +
        (item.transaction_type === "Earned"
          ? Number(item.coins)
          : -Number(item.coins)),
      0
    );

    const safeBalance = Math.max(0, balance);

    setCoins(safeBalance);
    setTransactions(transactionData);
    setLeague(leagueResult.data);
    setAchievements(achievementResult.data || []);
    setAvatars(avatarResult.data || []);
    setClaims(claimResult.data || []);
    setAvatarCatalog(avatarCatalogResult.data || []);

    setLoading(false);
  }

  function getCurrentLeague() {
    if (coins >= 300) return "Diamond";
    if (coins >= 200) return "Gold";
    if (coins >= 100) return "Silver";
    return "Bronze";
  }

  function getProgress() {
    const current = getCurrentLeague();
    const next = leagueInfo[current].next;

    if (next === null) return 100;

    const previous =
      current === "Bronze" ? 0 :
      current === "Silver" ? 100 : 200;

    return Math.min(
      100,
      ((coins - previous) / (next - previous)) * 100
    );
  }

  // Keep a small visible blue indicator when a student first enters a league.
  // This changes only the visual display, not the actual league calculation.
  function getDisplayProgress() {
    const progress = getProgress();

    if (progress === 0 && coins > 0 && getCurrentLeague() !== "Diamond") {
      return 5;
    }

    return progress;
  }

  function getAvatarThreshold(avatar) {
    if (avatar.required_league === "Silver") return 100;
    if (avatar.required_league === "Gold") return 200;
    if (avatar.required_league === "Diamond") return 300;
    return Infinity;
  }

  function isAvatarUnlocked(avatar) {
    return coins >= getAvatarThreshold(avatar);
  }

  function getSavedAvatar(avatarId) {
    return avatars.find(
      (item) => item.avatar_id === avatarId
    );
  }

  async function selectAvatar(avatar) {
    if (selectingAvatar) return;

    if (!isAvatarUnlocked(avatar)) {
      setMessage(
        `You need ${getAvatarThreshold(avatar)} coins to unlock this avatar.`
      );
      return;
    }

    if (!student) return;

    setSelectingAvatar(true);
    setMessage("");

    try {
      let savedAvatar = getSavedAvatar(avatar.id);

      // Create the student's avatar record if it does not exist.
      if (!savedAvatar) {
        const { data, error } = await supabase
          .from("student_avatars")
          .insert({
            student_id: student.id,
            avatar_id: avatar.id,
            is_selected: false,
          })
          .select("*, avatars(*)")
          .single();

        if (error) throw error;

        savedAvatar = data;
      }

      // Remove the previous selection.
      const { error: clearError } = await supabase
        .from("student_avatars")
        .update({ is_selected: false })
        .eq("student_id", student.id);

      if (clearError) throw clearError;

      // Select the chosen avatar.
      const { error: selectError } = await supabase
        .from("student_avatars")
        .update({ is_selected: true })
        .eq("student_id", student.id)
        .eq("avatar_id", avatar.id);

      if (selectError) throw selectError;

      setMessage(`${avatar.avatar_name} is now your selected avatar!`);

      await loadDashboard();
    } catch (error) {
      setMessage(
        error.message ||
        "Could not select this avatar. Please try again."
      );
    } finally {
      setSelectingAvatar(false);
    }
  }

  async function requestReward(e) {
    e.preventDefault();
    setMessage("");

    if (!league) {
      setMessage(
        "Your monthly league has not been generated yet. Please contact your teacher."
      );
      return;
    }

    if (!["Gold", "Diamond"].includes(league.league)) {
      setMessage(
        "Reward requests are available to Gold and Diamond students."
      );
      return;
    }

    if (!rewardType || !rewardDetails.trim()) {
      setMessage("Please select a reward and enter its details.");
      return;
    }

    const { error } = await supabase
      .from("reward_claims")
      .insert({
        student_id: student.id,
        league_id: league.id,
        reward_type: rewardType,
        reward_details: rewardDetails.trim(),
      });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Your reward request has been submitted!");
    setRewardType("");
    setRewardDetails("");

    await loadDashboard();
  }

  if (loading) {
    return <p>Loading your Learnova rewards...</p>;
  }

  if (!student) {
    return (
      <div className="student-gamification" style={styles.container}>
        <h2>Learnova Rewards</h2>
        <p>{message || "Student profile not found."}</p>
      </div>
    );
  }

  const currentLeague = getCurrentLeague();
  const info = leagueInfo[currentLeague];

  const sortedAvatarCatalog = [...avatarCatalog].sort(
    (a, b) =>
      (leagueOrder[a.required_league] || 99) -
      (leagueOrder[b.required_league] || 99)
  );

  const avatarGroups = ["Silver", "Gold", "Diamond"];

  return (
    <div className="student-gamification" style={styles.container}>
      <div className="gamification-header" style={styles.header}>
        <h2>🏆 My Learnova Rewards</h2>
        <p>Welcome, {student.full_name}!</p>
      </div>

      {message && (
        <p style={{
          color:
            message.includes("successfully") ||
            message.includes("submitted") ||
            message.includes("now your selected")
              ? "green"
              : "#c0392b",
        }}>
          {message}
        </p>
      )}

      {/* MONTHLY LEAGUE */}
      <div className="gamification-league-card" style={styles.leagueCard}>
        <div style={{ fontSize: "55px" }}>
          {info.emoji}
        </div>

        <p style={{ margin: "5px 0", color: "#777" }}>
          Your Monthly League
        </p>

        <h2 style={{
          color: info.color,
          margin: "5px 0",
          fontSize: "28px",
        }}>
          {currentLeague.toUpperCase()}
        </h2>

        <h3 style={{ margin: "8px 0" }}>
          🪙 {coins} Coins
        </h3>

        <div className="gamification-progress-background" style={styles.progressBackground}>
          <div style={{
            ...styles.progressBar,
            width: `${getDisplayProgress()}%`,
            background: "#398CCB",
          }} />
        </div>

        <p style={{ fontSize: "13px", color: "#777" }}>
          {info.next === null
            ? "Congratulations! You have reached Diamond League!"
            : `${info.next - coins} more coins to reach the next league.`}
        </p>
      </div>

      <button
        type="button"
        className="gamification-refresh"
        onClick={loadDashboard}
        style={styles.refreshButton}
      >
        Refresh My Progress
      </button>

      {/* COIN HISTORY */}
      <section className="gamification-section" style={styles.section}>
        <h3>🪙 My Coin History</h3>

        {transactions.length === 0 ? (
          <p>No coin transactions this month yet.</p>
        ) : (
          transactions.map((item) => (
            <div key={item.id} className="gamification-list-card" style={styles.listCard}>
              <div>
                <strong>{item.activity || "Activity"}</strong>
                <p style={styles.smallText}>{item.reason}</p>
                <small>
                  {new Date(item.created_at).toLocaleDateString()}
                </small>
              </div>

              <strong style={{
                color:
                  item.transaction_type === "Earned"
                    ? "green"
                    : "#d9534f",
              }}>
                {item.transaction_type === "Earned" ? "+" : "-"}
                {item.coins}
              </strong>
            </div>
          ))
        )}
      </section>

      {/* ACHIEVEMENTS */}
      <section className="gamification-section" style={styles.section}>
        <h3>🏅 My Achievements</h3>

        {achievements.length === 0 ? (
          <p>No badges unlocked yet. Keep learning!</p>
        ) : (
          <div className="gamification-grid" style={styles.grid}>
            {achievements.map((item) => (
              <div key={item.id} className="gamification-achievement-card" style={styles.achievementCard}>
                <div style={{ fontSize: "32px" }}>
                  {item.badge_icon || "🏅"}
                </div>

                <strong>{item.achievement_name}</strong>

                <p style={styles.smallText}>
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* AVATAR COLLECTION */}
      <section className="gamification-section" style={styles.section}>
        <h3>🎨 My Avatar Collection</h3>

        <p style={styles.smallText}>
          Unlock special characters by earning coins.
          Choose your favourite unlocked avatar!
        </p>

        {avatarCatalog.length === 0 ? (
          <p>No avatars found. Please check your avatar catalogue.</p>
        ) : (
          avatarGroups.map((group) => {
            const groupAvatars = sortedAvatarCatalog.filter(
              (avatar) => avatar.required_league === group
            );

            if (groupAvatars.length === 0) return null;

            const groupUnlocked =
              coins >= getAvatarThreshold(groupAvatars[0]);

            return (
              <div key={group} className="gamification-avatar-group" style={styles.avatarGroup}>
                <h4 style={styles.avatarGroupTitle}>
                  {group === "Silver" ? "🥈" :
                   group === "Gold" ? "🥇" : "💎"}{" "}
                  {group} League
                  <span style={styles.groupRequirement}>
                    {group === "Silver" ? "100 coins" :
                     group === "Gold" ? "200 coins" :
                     "300 coins"}
                  </span>
                </h4>

                <div className="gamification-grid" style={styles.grid}>
                  {groupAvatars.map((avatar) => {
                    const unlocked = isAvatarUnlocked(avatar);
                    const savedAvatar = getSavedAvatar(avatar.id);
                    const selected = savedAvatar?.is_selected;

                    return (
                      <div
                        key={avatar.id}
                        className="gamification-avatar-card"
                        style={{
                          ...styles.avatarCard,
                          opacity: unlocked ? 1 : 0.65,
                          border: selected
                            ? "2px solid #48a868"
                            : "1px solid #eee",
                        }}
                      >
                        <div className="gamification-avatar-image-container" style={styles.avatarImageContainer}>
                          {avatar.avatar_image ? (
                            <img
                              src={avatar.avatar_image}
                              alt={avatar.avatar_name}
                              style={{
                                ...styles.avatarImage,
                                filter: unlocked
                                  ? "none"
                                  : "grayscale(100%)",
                              }}
                            />
                          ) : (
                            <div style={{ fontSize: "40px" }}>
                              👤
                            </div>
                          )}

                          {!unlocked && (
                            <div style={styles.lockOverlay}>
                              🔒
                            </div>
                          )}
                        </div>

                        <strong style={styles.avatarName}>
                          {avatar.avatar_name}
                        </strong>

                        {selected && (
                          <span style={styles.selectedLabel}>
                            ✓ Selected
                          </span>
                        )}

                        {!unlocked ? (
                          <p style={styles.lockedText}>
                            🔒 {getAvatarThreshold(avatar)} coins required
                          </p>
                        ) : selected ? (
                          <button
                            type="button"
                            disabled
                            style={styles.selectedButton}
                          >
                            Selected
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={selectingAvatar}
                            onClick={() => selectAvatar(avatar)}
                            style={styles.selectButton}
                          >
                            {selectingAvatar ? "Please wait..." : "Choose Avatar"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </section>

      {/* LEAGUE REWARDS */}
      <section className="gamification-section" style={styles.section}>
        <h3>🎁 Request a League Reward</h3>

        {currentLeague === "Gold" ||
        currentLeague === "Diamond" ? (
          <form className="gamification-reward-form" onSubmit={requestReward}>
            <label>Select your privilege</label>

            <select
              value={rewardType}
              onChange={(e) => setRewardType(e.target.value)}
              style={styles.input}
              required
            >
              <option value="">Choose a reward</option>

              <option value="Shorter Class">
                Reduce one class by 15 minutes
              </option>

              <option value="Homework Extension">
                Extend one homework deadline by 4 days
              </option>

              {currentLeague === "Diamond" && (
                <>
                  <option value="Student Holiday">
                    Request a student holiday
                  </option>

                  <option value="Special Subject Day">
                    Choose a special subject day
                  </option>

                  <option value="Test Date Extension">
                    Request a test date extension
                  </option>
                </>
              )}
            </select>

            <label>Details of your request</label>

            <textarea
              value={rewardDetails}
              onChange={(e) => setRewardDetails(e.target.value)}
              placeholder="Enter your preferred date and other details..."
              rows="4"
              required
              style={styles.input}
            />

            <button type="submit" style={styles.refreshButton}>
              Submit Reward Request
            </button>
          </form>
        ) : (
          <p>
            {currentLeague === "Silver"
              ? "Your Silver avatar privileges are available in the avatar collection above."
              : "Keep earning coins to unlock your special privileges!"}
          </p>
        )}

        {claims.length > 0 && (
          <>
            <h4>My Reward Requests</h4>

            {claims.map((claim) => (
              <div key={claim.id} style={styles.listCard}>
                <div>
                  <strong>{claim.reward_type}</strong>
                  <p style={styles.smallText}>
                    {claim.reward_details}
                  </p>
                </div>

                <span style={styles.status}>
                  {claim.status}
                </span>
              </div>
            ))}
          </>
        )}
      </section>
    </div>
  );
}

const styles = {
  container: {
    background: "#fff",
    padding: "22px",
    borderRadius: "16px",
    marginTop: "20px",
    boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
  },

  header: {
    marginBottom: "20px",
  },

  leagueCard: {
    background: "#f7f7fb",
    borderRadius: "16px",
    padding: "25px 15px",
    textAlign: "center",
  },

  progressBackground: {
    height: "10px",
    background: "#e5e5e5",
    borderRadius: "10px",
    overflow: "hidden",
    margin: "15px 0 8px",
  },

  progressBar: {
    height: "100%",
    borderRadius: "10px",
    transition: "width 0.3s ease",
  },

  section: {
    marginTop: "28px",
  },

  refreshButton: {
    background: "#6658c7",
    color: "#fff",
    border: "none",
    padding: "12px 18px",
    borderRadius: "8px",
    cursor: "pointer",
    fontWeight: "600",
    marginTop: "12px",
  },

  listCard: {
    border: "1px solid #eee",
    borderRadius: "10px",
    padding: "13px",
    marginTop: "10px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
  },

  smallText: {
    color: "#777",
    fontSize: "13px",
    margin: "5px 0",
  },

  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
    gap: "12px",
  },

  achievementCard: {
    border: "1px solid #eee",
    borderRadius: "12px",
    padding: "15px",
    textAlign: "center",
  },

  avatarGroup: {
    marginTop: "22px",
  },

  avatarGroupTitle: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "8px",
    marginBottom: "12px",
    color: "#444",
  },

  groupRequirement: {
    fontSize: "12px",
    color: "#777",
    fontWeight: "normal",
    marginLeft: "auto",
  },

  avatarCard: {
    borderRadius: "12px",
    padding: "12px 8px",
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "7px",
    background: "#fff",
    minWidth: 0,
  },

  avatarImageContainer: {
    position: "relative",
    width: "100px",
    height: "100px",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },

  avatarImage: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
  },

  lockOverlay: {
    position: "absolute",
    inset: 0,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    fontSize: "27px",
    background: "rgba(255,255,255,0.25)",
    borderRadius: "10px",
  },

  avatarName: {
    fontSize: "13px",
    lineHeight: 1.4,
    minHeight: "36px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },

  selectedLabel: {
    color: "#27864a",
    fontSize: "12px",
    fontWeight: "bold",
  },

  lockedText: {
    color: "#999",
    fontSize: "11px",
    margin: "3px 0",
  },

  selectButton: {
    background: "#6658c7",
    color: "#fff",
    border: "none",
    borderRadius: "7px",
    padding: "8px 10px",
    fontSize: "11px",
    fontWeight: "600",
    cursor: "pointer",
    width: "100%",
  },

  selectedButton: {
    background: "#e5f5e9",
    color: "#27864a",
    border: "none",
    borderRadius: "7px",
    padding: "8px 10px",
    fontSize: "11px",
    fontWeight: "600",
    width: "100%",
  },

  input: {
    width: "100%",
    padding: "12px",
    border: "1px solid #ddd",
    borderRadius: "8px",
    boxSizing: "border-box",
    marginTop: "8px",
    marginBottom: "15px",
    fontSize: "14px",
  },

  status: {
    background: "#f0effa",
    color: "#6658c7",
    padding: "6px 10px",
    borderRadius: "20px",
    fontSize: "12px",
  },
};