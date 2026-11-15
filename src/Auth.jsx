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
      let user;

      if (role === "student") {
        // Student ID login through the Edge Function
        const { data, error } =
          await supabase.functions.invoke("student-login", {
            body: {
              student_id: loginId.trim().toUpperCase(),
              password,
            },
          });

        if (error) {
          let errorMessage = error.message;

          if (error.context) {
            try {
              const details = await error.context.clone().json();
              errorMessage = details.error || errorMessage;
            } catch {
              // Keep the original error.
            }
          }

          throw new Error(errorMessage);
        }

        if (!data?.success || !data?.session) {
          throw new Error(
            data?.error || "Invalid Student ID or password."
          );
        }

        // Establish the student's Supabase session
        const { data: sessionData, error: sessionError } =
          await supabase.auth.setSession({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          });

        if (sessionError) throw sessionError;

        user = sessionData.user || data.user;

        // Verify student profile and account status
        const { data: profile, error: profileError } =
          await supabase
            .from("students")
            .select("student_code, account_active")
            .eq("user_id", user.id)
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

      } else {
        // Teacher login remains email and password
        const { data, error } =
          await supabase.auth.signInWithPassword({
            email: loginId.trim(),
            password,
          });

        if (error) throw error;

        user = data.user;
      }

      onLogin(user);

    } catch (error) {
      setMessageType("error");
      setMessage(
        error.message || "Login failed. Please try again."
      );
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
          {
            redirectTo: window.location.origin,
          }
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

          <p>
            Sign in to continue your learning adventure.
          </p>
        </div>

        <div className="auth-switch">
          <button
            type="button"
            className={role === "student" ? "selected" : ""}
            onClick={() => {
              setRole("student");
              setLoginId("");
              setPassword("");
              setMessage("");
              setMessageType("info");
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
              setPassword("");
              setMessage("");
              setMessageType("info");
            }}
          >
            🍎 Teacher
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>

          <label className="auth-field">
            <span>
              {role === "student"
                ? "Student ID"
                : "Teacher Email"}
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
                onClick={() =>
                  setShowPassword((value) => !value)
                }
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
            Don't have your login details?
            Contact your teacher.
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

