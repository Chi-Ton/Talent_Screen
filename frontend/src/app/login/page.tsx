"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckSquare2,
  CircleAlert,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  LoaderCircle,
  BrainCircuit,
  ShieldCheck
} from "lucide-react";
import { ApiError } from "@/lib/api-client";
import { saveAuthSession } from "@/lib/auth-storage";
import { login } from "@/features/auth/auth-api";
import { LanguageToggle } from "@/components/language-toggle";

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [authError, setAuthError] = useState("");

  const emailError = submitted && !isValidEmail(email) ? "Please enter a valid work email address." : "";
  const passwordError = submitted && password.length < 6 ? "Password must be at least 6 characters." : "";

  function updateEmail(value: string) {
    setEmail(value);
    setSubmitted(false);
    setAuthError("");
  }

  function updatePassword(value: string) {
    setPassword(value);
    setSubmitted(false);
    setAuthError("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    setAuthError("");

    const normalizedEmail = email.trim();
    if (!isValidEmail(normalizedEmail) || password.length < 6) return;

    setIsSubmitting(true);
    try {
      const session = await login(normalizedEmail, password);
      saveAuthSession(session, remember);
      router.push("/screen");
    } catch (error) {
      setAuthError(error instanceof ApiError ? error.message : "Unable to sign in. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <aside className="auth-sidebar">
        <div className="auth-sidebar-top">
          <div className="auth-brand">
            <span className="auth-brand-icon"><BrainCircuit size={21} aria-hidden="true" /></span>
            <h1>TalentScreen AI</h1>
          </div>
          <p>AI-assisted IT candidate screening</p>
        </div>

        <div className="trust-list" aria-label="Security assurances">
          <div><LockKeyhole size={16} aria-hidden="true" /><span>Secure Processing</span></div>
          <div><KeyRound size={16} aria-hidden="true" /><span>Single HR Access</span></div>
          <div><CheckSquare2 size={16} aria-hidden="true" /><span>Evidence-grounded Scores</span></div>
        </div>
      </aside>

      <section className="auth-main">
        <div className="auth-form-wrap">
          <header className="auth-heading">
            <h2>Sign In</h2>
            <p>Access your private CV screening workspace</p>
          </header>

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            <div className="auth-field">
              <label htmlFor="email">Work Email</label>
              <input
                className={emailError ? "has-error" : ""}
                id="email"
                name="email"
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(event) => updateEmail(event.target.value)}
                aria-invalid={Boolean(emailError)}
                aria-describedby={emailError ? "email-error" : undefined}
              />
              {emailError ? <span className="field-error" id="email-error"><CircleAlert size={14} aria-hidden="true" />{emailError}</span> : null}
            </div>

            <div className="auth-field">
              <div className="auth-label-row">
                <label htmlFor="password">Password</label>
                <Link href="/forgot-password">Forgot password?</Link>
              </div>
              <div className="password-wrap">
                <input
                  className={passwordError || authError ? "has-error" : ""}
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(event) => updatePassword(event.target.value)}
                  aria-invalid={Boolean(passwordError || authError)}
                  aria-describedby={passwordError || authError ? "password-error" : undefined}
                />
                <button className="password-toggle" type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                </button>
              </div>
              {passwordError || authError ? <span className="field-error" id="password-error"><CircleAlert size={14} aria-hidden="true" />{passwordError || authError}</span> : null}
            </div>

            <label className="remember-row" htmlFor="remember">
              <input id="remember" name="remember" type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
              <span>Remember me for 30 days</span>
            </label>

            <button className="button primary auth-submit" type="submit" disabled={isSubmitting}>
              {isSubmitting ? <><LoaderCircle className="spin" size={16} aria-hidden="true" /> Signing in...</> : "Sign in"}
            </button>

          </form>

          <div className="auth-notice">
            <ShieldCheck size={16} aria-hidden="true" />
            <span>Candidate data is local and intended only for the authorized HR operator.</span>
          </div>
        </div>
      </section>
    </main>
  );
}
