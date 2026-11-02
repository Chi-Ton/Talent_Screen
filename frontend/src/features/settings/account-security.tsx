"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Bell,
  CheckCircle2,
  ChevronRight,
  Clock3,
  History,
  KeyRound,
  Laptop,
  LockKeyhole,
  LogOut,
  Mail,
  Monitor,
  Save,
  ShieldCheck,
  Smartphone,
  UserRound,
  X
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ApiError } from "@/lib/api-client";
import { fetchAccount, updateAccount } from "@/features/settings/settings-api";

type AccountTab = "Profile" | "Notifications" | "Security" | "Sessions";
type Session = { id: string; device: string; location: string; time: string; icon: typeof Laptop; current: boolean };

export function AccountSecuritySettings() {
  const [tab, setTab] = useState<AccountTab>("Profile");
  const [name, setName] = useState("Jane Doe");
  const [jobTitle, setJobTitle] = useState("Senior HR Manager");
  const [team, setTeam] = useState("Global Recruiting");
  const [timezone, setTimezone] = useState("(GMT-08:00) Pacific Time");
  const [language, setLanguage] = useState("English (US)");
  const [notice, setNotice] = useState("");
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchAccount().then((account) => {
      if (!active) return;
      setName(account.name);
      setJobTitle(account.jobTitle ?? "");
      setTimezone(account.timezone);
      setLanguage(account.language === "vi" ? "Vietnamese" : "English (US)");
    }).catch((error: unknown) => {
      if (active) setNotice(error instanceof ApiError ? error.message : "Unable to load account settings.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  function update(setter: (value: string) => void, value: string) { setter(value); setDirty(true); }
  async function saveProfile() {
    try {
      const account = await updateAccount({ name, jobTitle, timezone, language: language === "Vietnamese" ? "vi" : "en-US" });
      setName(account.name);
      setDirty(false);
      setNotice("Profile changes saved.");
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : "Unable to save profile changes.");
    }
  }
  function discardProfile() { setName("Jane Doe"); setJobTitle("Senior HR Manager"); setTeam("Global Recruiting"); setTimezone("(GMT-08:00) Pacific Time"); setLanguage("English (US)"); setDirty(false); setNotice("Unsaved changes discarded."); }

  return <AppShell activePath="/settings/rubric" breadcrumb="Administration / Settings / Account & Security"><div className="account-security-page"><header className="account-security-header"><div className="account-security-breadcrumb"><Link href="/admin/users-roles">Administration</Link><ChevronRight size={14} /><Link href="/settings/rubric">Settings</Link><ChevronRight size={14} /><strong>Account &amp; Security</strong></div><h1>Settings</h1><nav className="settings-section-tabs"><Link href="/settings/rubric">Screening rubric</Link><Link href="/settings/ai-taxonomy">AI &amp; taxonomy</Link><button className="active" type="button">Account &amp; security</button></nav></header><nav className="account-tabs" aria-label="Account settings views">{["Profile", "Notifications", "Security", "Sessions"].map((item) => <button className={tab === item ? "active" : ""} type="button" key={item} onClick={() => setTab(item as AccountTab)}>{item}</button>)}</nav>{loading ? <p role="status">Loading account settings...</p> : null}{tab === "Profile" ? <ProfilePanel name={name} jobTitle={jobTitle} team={team} timezone={timezone} language={language} onName={(value) => update(setName, value)} onJobTitle={(value) => update(setJobTitle, value)} onTeam={(value) => update(setTeam, value)} onTimezone={(value) => update(setTimezone, value)} onLanguage={(value) => update(setLanguage, value)} onNotice={setNotice} /> : tab === "Notifications" ? <NotificationsPanel onNotice={setNotice} /> : tab === "Security" ? <SecurityPanel onNotice={setNotice} /> : <SessionsPanel onNotice={setNotice} />}{tab === "Profile" ? <footer className="account-action-bar"><button className="button" type="button" onClick={discardProfile} disabled={!dirty}>Discard</button><button className="button primary" type="button" onClick={saveProfile} disabled={!dirty}><Save size={13} />Save changes</button></footer> : null}{notice ? <div className="account-toast" role="status"><CheckCircle2 size={15} />{notice}<button type="button" aria-label="Dismiss notice" onClick={() => setNotice("")}><X size={14} /></button></div> : null}</div></AppShell>;
}

function ProfilePanel({ name, jobTitle, team, timezone, language, onName, onJobTitle, onTeam, onTimezone, onLanguage, onNotice }: { name: string; jobTitle: string; team: string; timezone: string; language: string; onName: (value: string) => void; onJobTitle: (value: string) => void; onTeam: (value: string) => void; onTimezone: (value: string) => void; onLanguage: (value: string) => void; onNotice: (value: string) => void }) {
  return <section className="account-profile-card"><h2>Profile Information</h2><div className="account-profile-layout"><div className="account-avatar-panel"><div className="account-avatar-large"><UserRound size={44} /></div><button className="button" type="button" onClick={() => onNotice("Avatar upload is ready for image selection.")}>Change Avatar</button><p>JPG, GIF or PNG. Max size of 2MB.</p></div><div className="account-form-grid"><label>Full Name<input value={name} onChange={(event) => onName(event.target.value)} /></label><label>Work Email<input className="readonly-input" readOnly value="huuphuc2812005@gmail.com" /></label><label>Job Title<input value={jobTitle} onChange={(event) => onJobTitle(event.target.value)} /></label><label>Team<select value={team} onChange={(event) => onTeam(event.target.value)}><option>Global Recruiting</option><option>Engineering Hiring</option><option>Executive Search</option></select></label><label>Timezone<select value={timezone} onChange={(event) => onTimezone(event.target.value)}><option>(GMT-08:00) Pacific Time</option><option>(GMT-05:00) Eastern Time</option><option>(GMT+00:00) London</option><option>(GMT+07:00) Bangkok</option></select></label><label>Language<select value="Vietnamese" disabled><option>Tiếng Việt</option></select></label></div></div></section>;
}

function NotificationsPanel({ onNotice }: { onNotice: (value: string) => void }) {
  const [email, setEmail] = useState(true); const [browser, setBrowser] = useState(true); const [digest, setDigest] = useState(false);
  return <section className="account-settings-panel"><header><div><h2>Notification Preferences</h2><p>Choose which events should reach your inbox and browser.</p></div><Bell size={22} /></header><div className="notification-group"><h3>Email Notifications</h3><NotificationToggle label="Screening batch completed" detail="Receive a summary when CV processing finishes." checked={email} onChange={setEmail} /><NotificationToggle label="Review queue alerts" detail="Get notified when candidates require manual review." checked={email} onChange={setEmail} /><NotificationToggle label="Weekly recruiting digest" detail="Receive a weekly summary of funnel and quality metrics." checked={digest} onChange={setDigest} /></div><div className="notification-group"><h3>Browser Notifications</h3><NotificationToggle label="Desktop alerts" detail="Show important task and system alerts in this browser." checked={browser} onChange={setBrowser} /></div><button className="button primary account-panel-save" type="button" onClick={() => onNotice("Notification preferences saved.")}><Save size={13} />Save preferences</button></section>;
}

function NotificationToggle({ label, detail, checked, onChange }: { label: string; detail: string; checked: boolean; onChange: (value: boolean) => void }) { return <div className="notification-toggle"><span><strong>{label}</strong><small>{detail}</small></span><button type="button" role="switch" aria-checked={checked} className={checked ? "on" : ""} onClick={() => onChange(!checked)}><i /></button></div>; }

function SecurityPanel({ onNotice }: { onNotice: (value: string) => void }) {
  const [mfa, setMfa] = useState(true);
  return <section className="account-settings-panel"><header><div><h2>Security</h2><p>Protect your TalentScreen account and control sign-in methods.</p></div><ShieldCheck size={22} /></header><div className="security-status"><div className="security-status-icon"><ShieldCheck size={18} /></div><div><strong>Account security is strong</strong><span>Password updated 24 days ago · MFA enabled</span></div></div><div className="security-action-list"><button type="button" onClick={() => onNotice("Change password form is ready.")}><KeyRound size={16} /><span><strong>Change password</strong><small>Use a unique password with at least 12 characters.</small></span><ChevronRight size={15} /></button><div className="security-mfa-row"><ShieldCheck size={16} /><span><strong>Multi-factor authentication</strong><small>Require a verification code on new devices.</small></span><button type="button" role="switch" aria-checked={mfa} className={mfa ? "on" : ""} onClick={() => { setMfa(!mfa); onNotice(mfa ? "MFA disabled for this account." : "MFA enabled for this account."); }}><i /></button></div><button type="button" onClick={() => onNotice("Recovery codes regenerated.")}><LockKeyhole size={16} /><span><strong>Recovery codes</strong><small>Generate a new set of one-time recovery codes.</small></span><ChevronRight size={15} /></button></div><div className="security-audit-link"><History size={16} /><span>Security changes are recorded in the audit log.</span><Link href="/admin/audit-logs">View logs <ChevronRight size={13} /></Link></div></section>;
}

function SessionsPanel({ onNotice }: { onNotice: (value: string) => void }) {
  const [sessions, setSessions] = useState<Session[]>([{ id: "current", device: "Windows desktop", location: "San Francisco, US", time: "Active now", icon: Laptop, current: true }, { id: "mobile", device: "iPhone 15", location: "San Francisco, US", time: "2 hours ago", icon: Smartphone, current: false }, { id: "chrome", device: "Chrome on macOS", location: "New York, US", time: "3 days ago", icon: Monitor, current: false }]);
  function revoke(id: string) { setSessions((current) => current.filter((session) => session.id !== id)); onNotice("Session revoked."); }
  return <section className="account-settings-panel"><header><div><h2>Active Sessions</h2><p>Review devices that are currently signed in to your account.</p></div><Clock3 size={22} /></header><div className="sessions-list">{sessions.map((session) => <div className="session-row" key={session.id}><span className="session-device-icon"><session.icon size={18} /></span><span><strong>{session.device}</strong><small>{session.location} · {session.time}</small></span>{session.current ? <b>Current session</b> : <button type="button" onClick={() => revoke(session.id)}><LogOut size={13} />Revoke</button>}</div>)}</div><div className="sessions-footer"><button className="button" type="button" onClick={() => { setSessions((current) => current.filter((session) => session.current)); onNotice("All other sessions revoked."); }}><LogOut size={13} />Sign out all other sessions</button></div></section>;
}
