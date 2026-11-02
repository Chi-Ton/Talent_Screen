"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  CircleCheck,
  Eye,
  EyeOff,
  KeyRound,
  LayoutDashboard,
  ShieldCheck,
  UserCog,
  FileCheck2
} from "lucide-react";
import { LanguageToggle } from "@/components/language-toggle";

type RecoveryMode = "forgot" | "reset";

export function PasswordRecovery({ initialMode }: { initialMode: RecoveryMode }) {
  const [mode, setMode] = useState<RecoveryMode>(initialMode);
  const [email, setEmail] = useState("");
  const [emailSubmitted, setEmailSubmitted] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [resetSubmitted, setResetSubmitted] = useState(false);
  const [resetComplete, setResetComplete] = useState(false);

  const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const requirements = useMemo(() => [
    { label: "At least 8 characters", valid: newPassword.length >= 8 },
    { label: "One uppercase letter", valid: /[A-Z]/.test(newPassword) },
    { label: "One number", valid: /\d/.test(newPassword) },
    { label: "One special character (!@#$%^&*)", valid: /[^A-Za-z0-9]/.test(newPassword) }
  ], [newPassword]);
  const passwordIsValid = requirements.every((requirement) => requirement.valid);
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;

  function changeMode(nextMode: RecoveryMode) {
    setMode(nextMode);
    setEmailSubmitted(false);
    setResetSubmitted(false);
  }

  function handleForgotSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEmailSubmitted(true);
    if (!emailIsValid) return;
    setResetSent(true);
  }

  function handleResetSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResetSubmitted(true);
    if (!passwordIsValid || !passwordsMatch) return;
    setResetComplete(true);
  }

  return (
    <main className="recovery-page">
      <aside className="recovery-sidebar">
        <div>
          <div className="recovery-brand">
            <span><LayoutDashboard size={19} aria-hidden="true" /></span>
            <h1>TalentScreen AI</h1>
          </div>
          <h2>Enterprise-Grade HR Intelligence</h2>
          <div className="recovery-trust-list">
            <div>
              <ShieldCheck size={16} aria-hidden="true" />
              <p><strong>Secure Processing</strong>SOC2 Type II certified data handling.</p>
            </div>
            <div>
              <UserCog size={16} aria-hidden="true" />
              <p><strong>Role-based Access</strong>Granular permissions for enterprise compliance.</p>
            </div>
            <div>
              <FileCheck2 size={16} aria-hidden="true" />
              <p><strong>Auditable Decisions</strong>Full transparency in AI screening processes.</p>
            </div>
          </div>
        </div>
        <small className="recovery-copyright">(c) 2024 TalentScreen AI Inc.</small>
      </aside>

      <section className="recovery-main">
        <div className="recovery-mobile-brand">
          <LayoutDashboard size={19} aria-hidden="true" />
          <span>TalentScreen AI</span>
        </div>

        <div className="recovery-content">
          <div className="recovery-tabs" role="tablist" aria-label="Password recovery mode">
            <button className={mode === "forgot" ? "active" : ""} type="button" role="tab" aria-selected={mode === "forgot"} onClick={() => changeMode("forgot")}>Forgot Password</button>
            <button className={mode === "reset" ? "active" : ""} type="button" role="tab" aria-selected={mode === "reset"} onClick={() => changeMode("reset")}>Reset Password</button>
          </div>

          {mode === "forgot" ? (
            <div className="recovery-panel" role="tabpanel">
              <header className="recovery-heading">
                <h2>Reset your password</h2>
                <p>Enter your work email address and we&apos;ll send you a link to reset your password.</p>
              </header>

              <form className="recovery-form" onSubmit={handleForgotSubmit} noValidate>
                <div className="recovery-field">
                  <label htmlFor="recovery-email">Work Email</label>
                  <input
                    id="recovery-email"
                    type="email"
                    placeholder="name@company.com"
                    value={email}
                    onChange={(event) => { setEmail(event.target.value); setEmailSubmitted(false); setResetSent(false); }}
                    className={emailSubmitted && !emailIsValid ? "has-error" : ""}
                    aria-invalid={emailSubmitted && !emailIsValid}
                  />
                  {emailSubmitted && !emailIsValid ? <span className="field-error"><CircleAlert size={14} aria-hidden="true" />Please enter a valid work email address.</span> : null}
                </div>

                {resetSent ? <div className="recovery-success" role="status"><CheckCircle2 size={18} aria-hidden="true" /><span>A reset link has been sent to {email.replace(/^(.).+(@.*)$/, "$1***$2")}</span></div> : null}

                <button className="button primary recovery-submit" type="submit">Send reset link</button>
              </form>

              <Link className="back-sign-in" href="/login"><ArrowLeft size={16} aria-hidden="true" />Back to sign in</Link>
            </div>
          ) : (
            <div className="recovery-panel" role="tabpanel">
              <header className="recovery-heading">
                <h2>Create new password</h2>
                <p>Your new password must meet the security requirements below.</p>
              </header>

              {resetComplete ? <div className="recovery-success" role="status"><CheckCircle2 size={18} aria-hidden="true" /><span>Password updated successfully. You can now sign in.</span></div> : null}

              <form className="recovery-form" onSubmit={handleResetSubmit} noValidate>
                <PasswordField id="new-password" label="New Password" value={newPassword} visible={showNewPassword} onChange={setNewPassword} onToggle={() => setShowNewPassword((current) => !current)} />

                <div className="password-requirements">
                  <p>Password must contain:</p>
                  <ul>
                    {requirements.map((requirement) => (
                      <li className={requirement.valid ? "valid" : ""} key={requirement.label}>
                        {requirement.valid ? <CircleCheck size={16} aria-hidden="true" /> : <KeyRound size={16} aria-hidden="true" />}
                        {requirement.label}
                      </li>
                    ))}
                  </ul>
                </div>

                <PasswordField id="confirm-password" label="Confirm Password" value={confirmPassword} visible={showConfirmPassword} onChange={setConfirmPassword} onToggle={() => setShowConfirmPassword((current) => !current)} />
                {resetSubmitted && !passwordsMatch ? <span className="field-error"><CircleAlert size={14} aria-hidden="true" />Passwords do not match.</span> : null}

                <button className="button primary recovery-submit" type="submit" disabled={!passwordIsValid || !passwordsMatch || resetComplete}>
                  {resetComplete ? "Password reset" : "Reset password"}
                </button>
              </form>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function PasswordField({
  id,
  label,
  value,
  visible,
  onChange,
  onToggle
}: {
  id: string;
  label: string;
  value: string;
  visible: boolean;
  onChange: (value: string) => void;
  onToggle: () => void;
}) {
  return (
    <div className="recovery-field">
      <label htmlFor={id}>{label}</label>
      <div className="recovery-password-wrap">
        <input id={id} type={visible ? "text" : "password"} value={value} onChange={(event) => onChange(event.target.value)} />
        <button type="button" onClick={onToggle} aria-label={visible ? "Hide " + label.toLowerCase() : "Show " + label.toLowerCase()}>
          {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
