import { useState } from "react";
import { supabase } from "./supabaseClient";

function Auth({ onLogin }) {
  const [role, setRole] = useState("student");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const identifier =
        role === "student"
          ? `${loginId.trim().toLowerCase()}@students.learnova.invalid`
          : loginId.trim();

      const { data, error } =
        await supabase.auth.signInWithPassword({
          email: identifier,
          password,
        });

      if (error) throw error;

      if (role === "student") {
        const { data: profile, error: profileError } =
          await supabase
            .from("students")
            .select("student_code, account_active")
            .eq("user_id", data.user.id)
            .maybeSingle();

        if (profileError || !profile) {
          await supabase.auth.signOut();
          throw new Error(
            "Student profile not found. Please contact your teacher."
          );
        }

        if (!profile.account_active) {
          await supabase.auth.signOut();
          throw new Error(
            "Your account is inactive. Please contact your teacher."
          );
        }

        if (
          profile.student_code?.toUpperCase() !==
          loginId.trim().toUpperCase()
        ) {
          await supabase.auth.signOut();
          throw new Error("Invalid Student ID.");
        }
      }

      onLogin(data.user);

    } catch (error) {
      setMessageType("error");
      setMessage(error.message || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    if (role !== "teacher" || !loginId.trim()) {
      setMessageType("error");
      setMessage("Enter your teacher email address first.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const { error } =
        await supabase.auth.resetPasswordForEmail(
          loginId.trim(),
          { redirectTo: window.location.origin }
        );

      if (error) throw error;

      setMessageType("success");
      setMessage("Check your email for the password reset link.");

    } catch (error) {
      setMessageType("error");
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">

        <h1 className="auth-brand-name">
          Learñova<span>.</span>
        </h1>

        <p className="auth-tagline">
          Learn, grow, and achieve.
        </p>

        <div className="auth-heading">
          <p className="auth-eyebrow">
            YOUR LEARNING JOURNEY STARTS HERE
          </p>

          <h2>Welcome back!</h2>

          <p>Sign in to continue your learning adventure.</p>
        </div>

        <div className="auth-switch">
          <button
            type="button"
            className={role === "student" ? "selected" : ""}
            onClick={() => {
              setRole("student");
              setLoginId("");
              setMessage("");
            }}
          >
            🎒 Student
          </button>

          <button
            type="button"
            className={role === "teacher" ? "selected" : ""}
            onClick={() => {
              setRole("teacher");
              setLoginId("");
              setMessage("");
            }}
          >
            🍎 Teacher
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>

          <label className="auth-field">
            <span>
              {role === "student" ? "Student ID" : "Teacher Email"}
            </span>

            <input
              type={role === "student" ? "text" : "email"}
              placeholder={
                role === "student"
                  ? "Enter your Learnova ID"
                  : "Enter your email address"
              }
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              autoComplete="username"
              required
            />
          </label>

          <label className="auth-field">
            <span>Password</span>

            <div className="auth-password-wrap">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />

              <button
                className="auth-show-password"
                type="button"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </label>

          {role === "teacher" && (
            <div className="auth-forgot-row">
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={loading}
              >
                Forgot password?
              </button>
            </div>
          )}

          <button
            className="auth-submit"
            type="submit"
            disabled={loading}
          >
            {loading ? "Please wait..." : "Log In →"}
          </button>

        </form>

        {message && (
          <div
            className={`auth-message ${messageType}`}
            role="status"
          >
            {message}
          </div>
        )}

        {role === "student" && (
          <p className="auth-toggle">
            Don't have your login details? Contact your teacher.
          </p>
        )}

        <div className="auth-divider">
          <span>✦</span>
        </div>

        <p className="auth-footer">
          Made for curious minds <span>♥</span>
        </p>

      </section>
    </main>
  );
}

export default Auth;
      
