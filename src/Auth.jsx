import { useState } from "react";
import { supabase } from "./supabaseClient";

function Auth({ onLogin }) {
  const [isLogin, setIsLogin] = useState(true);
  const [role, setRole] = useState("student");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");
  const [loading, setLoading] = useState(false);

  // LOGIN AND REGISTRATION
  async function handleSubmit(e) {
    e.preventDefault();

    setMessage("");
    setLoading(true);

    try {
      if (isLogin) {
        const { data, error } =
          await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });

        if (error) throw error;

        onLogin(data.user);
      } else {
        if (role !== "student") {
          setMessageType("error");
          setMessage(
            "Teacher accounts must be created by the app administrator."
          );
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: name.trim(),
              role: "student",
            },
          },
        });

        if (error) throw error;

        if (data.user) {
          const { error: studentError } = await supabase
            .from("students")
            .insert([
              {
                user_id: data.user.id,
                full_name: name.trim(),
                email: email.trim(),
              },
            ]);

          if (studentError) {
            console.error(
              "Error saving student:",
              studentError.message
            );

            setMessageType("error");
            setMessage(
              "Your account was created, but your student details could not be saved. Please contact your teacher."
            );
            return;
          }
        }

        if (data.session) {
          onLogin(data.user);
        } else {
          setMessageType("success");
          setMessage(
            "Registration successful! Please check your email to confirm your account before logging in."
          );
        }
      }
    } catch (error) {
      setMessageType("error");
      setMessage(error.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // FORGOT PASSWORD
  async function handleForgotPassword() {
    if (!email.trim()) {
      setMessageType("error");
      setMessage("Please enter your email address first.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const { error } =
        await supabase.auth.resetPasswordForEmail(
          email.trim(),
          {
            redirectTo: window.location.origin,
          }
        );

      if (error) throw error;

      setMessageType("success");
      setMessage(
        "If an account exists for this email, a password reset link will be sent."
      );
    } catch (error) {
      setMessageType("error");
      setMessage(
        error.message || "Unable to send the reset email. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  // SWITCH BETWEEN LOGIN AND REGISTRATION
  function switchMode() {
    setIsLogin((current) => !current);
    setMessage("");
    setMessageType("info");
    setPassword("");
    setShowPassword(false);
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

          <h2>
            {isLogin ? "Welcome back!" : "Let's get started!"}
          </h2>

          <p>
            {isLogin
              ? "Sign in to continue your learning adventure."
              : "Create your student account and join Learnova."}
          </p>
        </div>

        {/* STUDENT / TEACHER SELECTION */}

        <div className="auth-switch">
          <button
            type="button"
            className={role === "student" ? "selected" : ""}
            onClick={() => setRole("student")}
          >
            🎒 Student
          </button>

          <button
            type="button"
            className={role === "teacher" ? "selected" : ""}
            onClick={() => setRole("teacher")}
          >
            🍎 Teacher
          </button>
        </div>

        {!isLogin && role === "teacher" && (
          <div className="auth-notice">
            Teacher accounts must be created by the Learnova administrator.
            Select Student to register.
          </div>
        )}

        {/* LOGIN / REGISTRATION FORM */}

        <form className="auth-form" onSubmit={handleSubmit}>

          {!isLogin && role === "student" && (
            <label className="auth-field">
              <span>Full name</span>

              <input
                type="text"
                placeholder="Enter your full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>
          )}

          <label className="auth-field">
            <span>Email address</span>

            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>

          <label className="auth-field">
            <span>Password</span>

            <div className="auth-password-wrap">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                autoComplete={
                  isLogin ? "current-password" : "new-password"
                }
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

          {isLogin && (
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
            disabled={loading || (!isLogin && role === "teacher")}
          >
            {loading
              ? "Please wait..."
              : isLogin
                ? "Log In →"
                : "Create Student Account →"}
          </button>

        </form>

        {/* SUCCESS / ERROR MESSAGE */}

        {message && (
          <div
            className={`auth-message ${messageType}`}
            role="status"
          >
            {message}
          </div>
        )}

        <div className="auth-divider">
          <span>✦</span>
        </div>

        <p className="auth-toggle">
          {isLogin
            ? "New to Learnova?"
            : "Already have an account?"}

          {" "}

          <button type="button" onClick={switchMode}>
            {isLogin ? "Create an account" : "Log in"}
          </button>
        </p>

        <p className="auth-footer">
          Made for curious minds <span>♥</span>
        </p>

      </section>
    </main>
  );
}

export default Auth;