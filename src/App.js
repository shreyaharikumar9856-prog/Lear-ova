import { useState } from "react";
import "./App.css";

function App() {
  const [activeTab, setActiveTab] = useState("Dashboard");

  const menuItems = [
    { icon: "🏡", name: "Dashboard" },
    { icon: "📚", name: "My Subjects" },
    { icon: "🗓️", name: "Timetable" },
    { icon: "📝", name: "Homework" },
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
            <h3>Little Learner</h3>
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
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="date-label">YOUR LITTLE CORNER OF THE INTERNET 🌸</p>
            <h1>
              {activeTab === "Dashboard"
                ? "Hello, sunshine! ☀️"
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

        {activeTab === "Dashboard" ? (
          <>
            <section className="hero-card">
              <div className="hero-text">
                <span className="tiny-tag">✦ YOUR LEARNING JOURNEY ✦</span>
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
              <div className="hero-illustration">
                <div className="sun-circle">☀️</div>
                <div className="hero-bear">🐻</div>
                <div className="floating-book">📚</div>
                <div className="floating-star">⭐</div>
                <div className="hero-caption">You're doing amazing!</div>
              </div>