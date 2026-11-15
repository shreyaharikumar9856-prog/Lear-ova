import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import Auth from "./Auth";
import TeacherDashboard from "./TeacherDashboard";
import StudentHomework from "./StudentHomework";
import StudentGamification from "./StudentGamification";
import StudentTimetable from "./StudentTimetable";
import StudentSubjects from "./StudentSubjects";
import StudentAnnouncements from "./StudentAnnouncements";
import "./App.css";

function formatScheduleTime(value) {
  if (!value) return "Time TBA";

  const [hours, minutes] = String(value).split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return value;

  const date = new Date();
  date.setHours(hours, minutes, 0, 0);

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function getSubjectIcon(subject) {
  if (subject?.subject_icon) return subject.subject_icon;

  const name = (subject?.subject_name || "").toLowerCase();
  if (name.includes("math")) return "📐";
  if (name.includes("science")) return "🔬";
  if (name.includes("english")) return "📚";
  if (name.includes("malayalam")) return "📖";
  if (name.includes("biology")) return "🧬";
  if (name.includes("chemistry")) return "⚗️";
  if (name.includes("physics")) return "⚡";
  if (name.includes("social")) return "🌍";
  if (name.includes("hindi")) return "📖";
  if (name === "it" || name.includes("information technology")) return "💻";
  return "📘";
}

function App() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [checkingRole, setCheckingRole] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [selectedAvatar, setSelectedAvatar] = useState(null);
  const [dashboardData, setDashboardData] = useState({
    loading: true,
    coins: 0,
    classesAttended: 0,
    subjectCount: 0,
    achievementCount: 0,
    subjects: [],
    todayClasses: [],
    announcements: [],
    errors: {},
  });

  // Check the current login session
  useEffect(() => {
    let mounted = true;

    async function checkSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (mounted) {
        setUser(session?.user ?? null);
        setCheckingAuth(false);
      }
    }

    checkSession();

    return () => {
      mounted = false;
    };
  }, []);

  // Listen for login and logout changes
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

    // Logout function
  async function handleLogout() {
    const { error } = await supabase.auth.signOut();

    if (error) {
      alert("Unable to log out. Please try again.");
      console.error(error);
      return;
    }

    setActiveTab("Dashboard");
    setRole(null);
    setSelectedAvatar(null);
  }
  // Fetch the user's role
  useEffect(() => {
    let cancelled = false;

    async function fetchUserRole() {
      if (!user) {
        setRole(null);
        setCheckingRole(false);
        return;
      }

      setCheckingRole(true);

      try {
        const { data, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .maybeSingle();

        if (cancelled) return;

        if (error) {
          console.error("Error fetching role:", error.message);
          setRole(null);
        } else {
          setRole(data?.role ?? "student");
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Unable to verify account role:", error);
          setRole(null);
        }
      } finally {
        if (!cancelled) {
          setCheckingRole(false);
        }
      }
    }

    fetchUserRole();

    return () => {
      cancelled = true;
    };
  }, [user]);

  // Fetch selected avatar and listen for avatar changes
  useEffect(() => {
    let cancelled = false;
    let avatarSubscription = null;

    async function setupAvatarListener() {
      if (!user) {
        setSelectedAvatar(null);
        return;
      }

      try {
        // Find the logged-in student's record
        const { data: student, error: studentError } = await supabase
          .from("students")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (cancelled) return;

        if (studentError) {
          console.error(
            "Error fetching student:",
            studentError.message
          );
          setSelectedAvatar(null);
          return;
        }

        if (!student) {
          setSelectedAvatar(null);
          return;
        }

        // Function to load the currently selected avatar
        const loadSelectedAvatar = async () => {
          const { data, error } = await supabase
            .from("student_avatars")
            .select("avatars(avatar_image, avatar_name)")
            .eq("student_id", student.id)
            .eq("is_selected", true)
            .maybeSingle();

          if (cancelled) return;

          if (error) {
            console.error(
              "Error fetching selected avatar:",
              error.message
            );
            setSelectedAvatar(null);
            return;
          }

          setSelectedAvatar(data?.avatars ?? null);
        };

        // Load avatar initially
        await loadSelectedAvatar();

        if (cancelled) return;

        // Subscribe once to changes in this student's avatar records
        avatarSubscription = supabase
          .channel(`selected-avatar-${student.id}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "student_avatars",
              filter: `student_id=eq.${student.id}`,
            },
            () => {
              loadSelectedAvatar();
            }
          )
          .subscribe();
      } catch (error) {
        if (!cancelled) {
          console.error(
            "Unable to load selected avatar:",
            error
          );
          setSelectedAvatar(null);
        }
      }
    }

    setupAvatarListener();

    return () => {
      cancelled = true;

      if (avatarSubscription) {
        supabase.removeChannel(avatarSubscription);
      }
    };
  }, [user]);

  // Load real student dashboard information from Supabase.
  useEffect(() => {
    let cancelled = false;
    let dashboardChannel = null;

    async function setupStudentDashboard() {
      if (!user || role !== "student") {
        setDashboardData({
          loading: true,
          coins: 0,
          classesAttended: 0,
          subjectCount: 0,
          achievementCount: 0,
          subjects: [],
          todayClasses: [],
          announcements: [],
          errors: {},
        });
        return;
      }

      const { data: student, error: studentError } = await supabase
        .from("students")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (cancelled) return;

      if (studentError || !student) {
        console.error(
          "Unable to load student dashboard profile:",
          studentError?.message || "Student profile not found."
        );
        setDashboardData({
          loading: false,
          coins: null,
          classesAttended: null,
          subjectCount: null,
          achievementCount: null,
          subjects: [],
          todayClasses: [],
          announcements: [],
          errors: {
            profile: studentError?.message || "Student profile not found.",
          },
        });
        return;
      }

      async function loadDashboardData() {
        const now = new Date();
        const monthStart = `${now.getFullYear()}-${String(
          now.getMonth() + 1
        ).padStart(2, "0")}-01`;
        const todayName = new Intl.DateTimeFormat("en-US", {
          weekday: "long",
        }).format(now);
        const todayShort = todayName.slice(0, 3).toLowerCase();

        const [
          transactionsResult,
          attendanceResult,
          subjectsResult,
          achievementsResult,
          timetableResult,
          announcementsResult,
        ] = await Promise.all([
          supabase
            .from("coin_transactions")
            .select("coins, transaction_type")
            .eq("student_id", student.id)
            .eq("month_start", monthStart),

          supabase
            .from("attendance")
            .select("id", { count: "exact", head: true })
            .eq("student_id", student.id)
            .eq("status", "Present"),

          supabase
            .from("student_subjects")
            .select("subject_id, subjects(id, subject_name, description, subject_icon)")
            .eq("student_id", student.id),

          supabase
            .from("student_achievements")
            .select("id")
            .eq("student_id", student.id),

          supabase
            .from("timetable")
            .select(
              "id, subject, day_of_week, start_time, end_time, teacher_name, meeting_link, notes"
            )
            .eq("student_id", student.id),

          supabase
            .from("announcements")
            .select("id, title, message, student_id, created_at")
            .or(`student_id.is.null,student_id.eq.${student.id}`)
            .order("created_at", { ascending: false })
            .limit(3),
        ]);

        if (cancelled) return;

        const errors = {
          coins: transactionsResult.error?.message || null,
          attendance: attendanceResult.error?.message || null,
          subjects: subjectsResult.error?.message || null,
          achievements: achievementsResult.error?.message || null,
          timetable: timetableResult.error?.message || null,
          announcements: announcementsResult.error?.message || null,
        };

        Object.entries(errors).forEach(([key, error]) => {
          if (error) {
            console.error(`Dashboard ${key} data error:`, error);
          }
        });

        const transactions = transactionsResult.data || [];
        const calculatedCoins = transactions.reduce(
          (total, item) =>
            total +
            (item.transaction_type === "Earned"
              ? Number(item.coins)
              : -Number(item.coins)),
          0
        );

        const subjects = (subjectsResult.data || [])
          .map((row) =>
            Array.isArray(row.subjects) ? row.subjects[0] : row.subjects
          )
          .filter(Boolean);

        const todayClasses = (timetableResult.data || [])
          .filter(
            (item) =>
              String(item.day_of_week || "")
                .trim()
                .slice(0, 3)
                .toLowerCase() === todayShort
          )
          .sort((a, b) =>
            String(a.start_time || "").localeCompare(
              String(b.start_time || "")
            )
          );

        setDashboardData({
          loading: false,
          coins: errors.coins ? null : Math.max(0, calculatedCoins),
          classesAttended: errors.attendance
            ? null
            : (attendanceResult.count ?? 0),
          subjectCount: errors.subjects ? null : subjects.length,
          achievementCount: errors.achievements
            ? null
            : (achievementsResult.data || []).length,
          subjects: errors.subjects ? [] : subjects,
          todayClasses: errors.timetable ? [] : todayClasses,
          announcements: errors.announcements
            ? []
            : announcementsResult.data || [],
          errors,
        });
      }

      await loadDashboardData();
      if (cancelled) return;

      // Keep the dashboard fresh when teachers update student information.
      dashboardChannel = supabase
        .channel(`student-dashboard-${student.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "coin_transactions",
            filter: `student_id=eq.${student.id}`,
          },
          loadDashboardData
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "attendance",
            filter: `student_id=eq.${student.id}`,
          },
          loadDashboardData
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "student_subjects",
            filter: `student_id=eq.${student.id}`,
          },
          loadDashboardData
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "student_achievements",
            filter: `student_id=eq.${student.id}`,
          },
          loadDashboardData
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "timetable",
            filter: `student_id=eq.${student.id}`,
          },
          loadDashboardData
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "announcements",
          },
          loadDashboardData
        )
        .subscribe();
    }

    setupStudentDashboard();

    return () => {
      cancelled = true;
      if (dashboardChannel) {
        supabase.removeChannel(dashboardChannel);
      }
    };
  }, [user, role]);

  // Loading screens
  if (checkingAuth) {
    return <p>Loading Learnova...</p>;
  }

  if (!user) {
    return <Auth onLogin={setUser} />;
  }

  if (checkingRole) {
    return <p>Checking your account...</p>;
  }

  // Teacher dashboard
  if (role === "teacher") {
  return <TeacherDashboard onLogout={handleLogout} />;
}

  if (role !== "student") {
    return <p>Unable to verify your account role.</p>;
  }

  // Student navigation
  const menuItems = [
    { icon: "🏡", name: "Dashboard" },
    { icon: "📚", name: "My Subjects" },
    { icon: "🗓️", name: "Timetable" },
    { icon: "📝", name: "Homework" },
    { icon: "📢", name: "Announcements" },
    { icon: "🏆", name: "Achievements" },
    { icon: "🎮", name: "Fun Zone" },
    { icon: "💌", name: "Messages" },

  ];

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">🌷</div>

          <div>
            <h2>Learñova</h2>
            <p>Learn • Grow • Shine</p>
          </div>
        </div>

        <div className="profile">
          <div className="avatar">🐻</div>

          <div>
            <h3>
              {user.user_metadata?.full_name ||
                user.email?.split("@")[0] ||
                "Little Learner"}
            </h3>
            <p>Student account ✨</p>
          </div>
        </div>

        <p className="menu-heading">YOUR LEARNING SPACE</p>

        <nav>
          {menuItems.map((item) => (
            <button
              key={item.name}
              className={`menu-item ${
                activeTab === item.name ? "active" : ""
              }`}
              onClick={() => setActiveTab(item.name)}
            >
              <span>{item.icon}</span>
              {item.name}

              {item.name === "Messages" && (
                <span className="message-dot">2</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="plant">🌱</div>
          <h3>Keep growing!</h3>
          <p>Every little step counts.</p>

          <div className="growth-bar">
            <div></div>
          </div>

          <small>You're doing great! 💗</small>
        </div>

        <button
          className="settings-button"
          onClick={() => setActiveTab("Settings")}
        >
          ⚙️ Settings
        </button>
                <button
          type="button"
          className="settings-button"
          onClick={handleLogout}
          style={{ marginTop: "8px" }}
        >
          🚪 Log Out
        </button>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="date-label">
              YOUR LITTLE CORNER OF THE INTERNET 🌸
            </p>

            <h1>
              {activeTab === "Dashboard"
                ? `Hello, ${
                    user.user_metadata?.full_name ||
                    user.email?.split("@")[0] ||
                    "sunshine"
                  }! ☀️`
                : activeTab}
            </h1>

            <p className="welcome-text">
              {activeTab === "Dashboard"
                ? "Ready to learn something wonderful today?"
                : `Welcome to your ${activeTab.toLowerCase()} space!`}
            </p>
          </div>

          <div className="topbar-right">
            <button
              className="notification"
              onClick={() => alert("You're all caught up! 💌")}
              aria-label="Notifications"
            >
              🔔<span></span>
            </button>

            <div className="top-avatar">🐻</div>
          </div>
        </header>

        {/* Student Dashboard */}
        {activeTab === "Dashboard" ? (
          <>
            <section className="hero-card">
              <div className="hero-text">
                <span className="tiny-tag">
                  ✦ YOUR LEARNING JOURNEY ✦
                </span>

                <h2>
                  Small steps,
                  <br />
                  <span>big dreams!</span>
                </h2>

                <p>
                  Every lesson you learn brings you closer to the amazing
                  things you can become.
                </p>

                <button
                  className="primary-button"
                  onClick={() => setActiveTab("My Subjects")}
                >
                  Explore my subjects <span>→</span>
                </button>
              </div>

              {/* Selected avatar illustration */}
              <div className="hero-illustration">
                <div className="sun-circle">☀️</div>

                {selectedAvatar?.avatar_image ? (
                  <img
                    src={selectedAvatar.avatar_image}
                    alt={
                      selectedAvatar.avatar_name ||
                      "My selected avatar"
                    }
                    className="hero-character-image"
                  />
                ) : (
                  <div className="hero-bear">🐻</div>
                )}

                <div className="floating-star">⭐</div>

                <div className="hero-caption">
                  You're doing amazing!
                </div>
              </div>

              <div className="hero-decoration decoration-one"></div>
              <div className="hero-decoration decoration-two"></div>
            </section>

            
            <section className="stats-grid">
              <div className="stat-card pink">
                <div className="stat-icon">🪙</div>
                <p>My coins this month</p>
                <h2>
                  {dashboardData.loading
                    ? "…"
                    : dashboardData.coins ?? "—"} <span>coins</span>
                </h2>
                <small>
                  {dashboardData.errors.coins
                    ? "Unable to load coin balance"
                    : "✦ Keep earning!"}
                </small>
              </div>

              <div className="stat-card lavender">
                <div className="stat-icon">📅</div>
                <p>Classes attended</p>
                <h2>
                  {dashboardData.loading
                    ? "…"
                    : dashboardData.classesAttended ?? "—"} <span>classes</span>
                </h2>
                <small>
                  {dashboardData.errors.attendance
                    ? "Unable to load attendance"
                    : "✦ Every class counts!"}
                </small>
              </div>

              <div className="stat-card mint">
                <div className="stat-icon">📖</div>
                <p>My subjects</p>
                <h2>
                  {dashboardData.loading
                    ? "…"
                    : dashboardData.subjectCount ?? "—"} <span>subjects</span>
                </h2>
                <small>
                  {dashboardData.errors.subjects
                    ? "Unable to load subjects"
                    : "✦ Keep exploring!"}
                </small>
              </div>

              <div className="stat-card peach">
                <div className="stat-icon">🏅</div>
                <p>Achievements</p>
                <h2>
                  {dashboardData.loading
                    ? "…"
                    : dashboardData.achievementCount ?? "—"} <span>badges</span>
                </h2>
                <small>
                  {dashboardData.errors.achievements
                    ? "Unable to load achievements"
                    : "✦ More to unlock!"}
                </small>
              </div>
            </section>

            <section className="content-grid">
              <div className="panel subjects-panel">
                <div className="panel-heading">
                  <div>
                    <h2>My subjects 📚</h2>
                    <p>A little learning every day!</p>
                  </div>

                  <button
                    className="text-button"
                    onClick={() => setActiveTab("My Subjects")}
                  >
                    View all →
                  </button>
                </div>

                <div className="subject-list">
                  {dashboardData.loading ? (
                    <p>Loading your subjects...</p>
                  ) : dashboardData.errors.subjects ? (
                    <p>Unable to load your assigned subjects.</p>
                  ) : dashboardData.subjects.length === 0 ? (
                    <p>No subjects have been assigned yet.</p>
                  ) : (
                    dashboardData.subjects.slice(0, 4).map((subject) => (
                      <div className="subject-row" key={subject.id}>
                        <div className="subject-icon">
                          {getSubjectIcon(subject)}
                        </div>

                        <div className="subject-info">
                          <h3>{subject.subject_name}</h3>
                          <p>
                            {subject.description || "Assigned to your learning plan."}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="panel tasks-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Today's plan 🌼</h2>
                    <p>One thing at a time.</p>
                  </div>

                  <span className="plan-date">TODAY</span>
                </div>

                {dashboardData.loading ? (
                  <p>Loading today's timetable...</p>
                ) : dashboardData.errors.timetable ? (
                  <p>Unable to load today's timetable.</p>
                ) : dashboardData.todayClasses.length === 0 ? (
                  <p className="no-classes-message">
                    No classes are scheduled for today. Enjoy your day! 🌷
                  </p>
                ) : (
                  dashboardData.todayClasses.map((item) => (
                    <div className="task-item" key={item.id}>
                      <div className="task-time">
                        {formatScheduleTime(item.start_time)}
                        {item.end_time
                          ? ` – ${formatScheduleTime(item.end_time)}`
                          : ""}
                      </div>

                      <div className="task-details">
                        <h3>{item.subject || "Class"}</h3>
                        <p>
                          {item.teacher_name
                            ? `Teacher: ${item.teacher_name}`
                            : item.notes || "Scheduled class"}
                        </p>
                        {item.meeting_link && (
                          <a
                            className="task-meeting-link"
                            href={item.meeting_link}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Join class →
                          </a>
                        )}
                      </div>

                      <span className="task-emoji">📚</span>
                    </div>
                  ))
                )}

                <button
                  className="secondary-button"
                  onClick={() => setActiveTab("Timetable")}
                >
                  See my timetable →
                </button>
              </div>
            </section>

            <section className="panel dashboard-announcements">
              <div className="panel-heading">
                <div>
                  <h2>📢 Latest Announcements</h2>
                  <p>Updates from your teacher</p>
                </div>

                <button
                  className="text-button"
                  type="button"
                  onClick={() => setActiveTab("Announcements")}
                >
                  View all →
                </button>
              </div>

              {dashboardData.loading ? (
                <p>Loading announcements...</p>
              ) : dashboardData.errors.announcements ? (
                <p>Unable to load announcements right now.</p>
              ) : dashboardData.announcements.length === 0 ? (
                <p>No announcements yet. Check back later! 🌸</p>
              ) : (
                <div className="dashboard-announcement-list">
                  {dashboardData.announcements.map((item) => (
                    <article
                      className="dashboard-announcement-card"
                      key={item.id}
                    >
                      <h3>{item.title}</h3>
                      <p>{item.message}</p>
                      <small>
                        {item.created_at
                          ? new Date(item.created_at).toLocaleString()
                          : "Recently published"}
                      </small>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="bottom-banner">
              <div className="banner-emoji">🌈</div>

              <div>
                <h3>A little reminder for you</h3>
                <p>
                  You don't have to be perfect. You just have to keep trying.
                  💗
                </p>
              </div>

              <div className="banner-stars">✦ ✧ ✦</div>
            </section>
          </>
       ) : activeTab === "My Subjects" ? (
         <StudentSubjects />
       ) : activeTab === "Homework" ? (
         <StudentHomework />
       ) : activeTab === "Timetable" ? (
         <StudentTimetable />
       ) : activeTab === "Achievements" ? (
         <StudentGamification />
       ) : activeTab === "Announcements" ? (
         <StudentAnnouncements />
       ) : (
          <section className="panel placeholder-panel">
            <div className="placeholder-emoji">
              {menuItems.find((item) => item.name === activeTab)?.icon ||
                "⚙️"}
            </div>

            <h2>{activeTab}</h2>

            <p>
              Your {activeTab.toLowerCase()} space is ready for its next step!
              🌷
            </p>

            <p className="placeholder-note">
              This section is currently a preview. We'll build its working
              features together.
            </p>

            <button
              className="primary-button"
              onClick={() => setActiveTab("Dashboard")}
            >
              ← Back to dashboard
            </button>
          </section>
        )}

        <footer>
          Made with 💗 for curious minds <span>•</span> Learñova © 2026
        </footer>
      </main>
    </div>
  );
}

export default App;
