"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  History,
  Mail,
  MoreVertical,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  UserPlus,
  Users,
  X
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ApiError } from "@/lib/api-client";
import { fetchAdminUsers, type ApiAdminUser } from "@/features/admin/admin-api";

type UserStatus = "Active" | "Suspended" | "Pending";
type UserRecord = { id: string; name: string; email: string; role: string; team: string; status: UserStatus; lastActive: string; mfa: boolean; initials: string; tone: string; invitation?: boolean };

const initialUsers: UserRecord[] = [
  { id: "U-001", name: "Sarah Jenkins", email: "sarah.j@talentscreen.ai", role: "Admin", team: "Global", status: "Active", lastActive: "2 mins ago", mfa: true, initials: "SJ", tone: "blue" },
  { id: "U-002", name: "David Chen", email: "david.c@talentscreen.ai", role: "HR Manager", team: "Engineering", status: "Active", lastActive: "1 hour ago", mfa: true, initials: "DC", tone: "teal" },
  { id: "U-003", name: "Michael Ross", email: "m.ross@talentscreen.ai", role: "HR Reviewer", team: "Sales", status: "Suspended", lastActive: "Oct 12, 2023", mfa: false, initials: "MR", tone: "gray" },
  { id: "U-004", name: "Invitation Sent", email: "elena.smith@talentscreen.ai", role: "HR Reviewer", team: "Marketing", status: "Pending", lastActive: "-", mfa: false, initials: "", tone: "pending", invitation: true }
];

export function UsersAndRoles() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activeTab, setActiveTab] = useState("Users");
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("All Roles");
  const [statusFilter, setStatusFilter] = useState("All Statuses");
  const [teamFilter, setTeamFilter] = useState("All Teams");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [actionId, setActionId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    fetchAdminUsers().then((items) => {
      if (active) setUsers(items.map(toUserRecord));
    }).catch((error: unknown) => {
      if (active) setLoadError(error instanceof ApiError ? error.message : "Unable to load users.");
    }).finally(() => {
      if (active) setIsLoading(false);
    });
    return () => { active = false; };
  }, []);

  const filteredUsers = useMemo(() => users.filter((user) => {
    const text = (user.name + " " + user.email).toLowerCase();
    return text.includes(query.toLowerCase()) && (roleFilter === "All Roles" || user.role === roleFilter) && (statusFilter === "All Statuses" || user.status === statusFilter) && (teamFilter === "All Teams" || user.team === teamFilter);
  }), [query, roleFilter, statusFilter, teamFilter, users]);

  function toggleSelected(id: string) {
    setSelected((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]);
  }

  function updateStatus(user: UserRecord) {
    const nextStatus: UserStatus = user.status === "Suspended" ? "Active" : "Suspended";
    setUsers((current) => current.map((item) => item.id === user.id ? { ...item, status: nextStatus } : item));
    setActionId("");
    setNotice(user.name + " is now " + nextStatus.toLowerCase() + ".");
  }

  function resetMfa(user: UserRecord) {
    setUsers((current) => current.map((item) => item.id === user.id ? { ...item, mfa: false } : item));
    setActionId("");
    setNotice("MFA reset for " + user.name + ".");
  }

  function resendInvitation(user: UserRecord) {
    setNotice("Invitation resent to " + user.email + ".");
  }

  function sendInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "new.user@company.com");
    const role = String(form.get("role") || "HR Reviewer");
    const team = String(form.get("team") || "Engineering");
    const newUser: UserRecord = { id: "INV-" + String(users.length + 1).padStart(3, "0"), name: "Invitation Sent", email, role, team, status: "Pending", lastActive: "-", mfa: false, initials: "", tone: "pending", invitation: true };
    setUsers((current) => [...current, newUser]);
    setInviteOpen(false);
    setNotice("Invitation sent to " + email + ".");
  }

  function changeRole(user: UserRecord, role: string) {
    setUsers((current) => current.map((item) => item.id === user.id ? { ...item, role } : item));
    setActionId("");
    setNotice(user.name + " role updated to " + role + ".");
  }

  return (
    <AppShell activePath="/admin/users-roles" breadcrumb="Administration / Users & Roles">
      <div className="users-roles-page">
        <header className="users-roles-header"><div className="users-roles-breadcrumb"><Link href="/dashboard">Administration</Link><ChevronRight size={14} /><strong>Users &amp; Roles</strong></div><div className="users-roles-title-row"><h1>Users</h1><button className="button primary" type="button" onClick={() => setInviteOpen(true)}><UserPlus size={14} />Invite User</button></div><nav className="users-roles-tabs" aria-label="Administration views"><button className={activeTab === "Users" ? "active" : ""} type="button" onClick={() => setActiveTab("Users")}>Users ({users.length})</button><button className={activeTab === "Roles & Permissions" ? "active" : ""} type="button" onClick={() => setActiveTab("Roles & Permissions")}>Roles &amp; Permissions</button><button className={activeTab === "Invitations" ? "active" : ""} type="button" onClick={() => setActiveTab("Invitations")}>Invitations</button></nav></header>
        {activeTab === "Users" ? <><section className="users-roles-filter"><div className="users-roles-search"><Search size={15} /><input aria-label="Search users" placeholder="Search users by name or email..." value={query} onChange={(event) => setQuery(event.target.value)} /></div><select aria-label="Filter by role" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option>All Roles</option><option>Admin</option><option>HR Manager</option><option>HR Reviewer</option><option>Auditor</option></select><select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>All Statuses</option><option>Active</option><option>Pending</option><option>Suspended</option></select><select aria-label="Filter by team" value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)}><option>All Teams</option><option>Engineering</option><option>Sales</option><option>Marketing</option><option>Global</option></select><button className="users-more-filter" type="button" onClick={() => setNotice("Advanced user filters are ready for backend integration.")}><Users size={14} />More Filters</button></section><section className="users-table-card"><div className="users-table-wrap"><table className="users-table"><thead><tr><th className="users-check"><input type="checkbox" aria-label="Select all visible users" checked={filteredUsers.length > 0 && filteredUsers.every((user) => selected.includes(user.id))} onChange={() => setSelected(filteredUsers.every((user) => selected.includes(user.id)) ? [] : filteredUsers.map((user) => user.id))} /></th><th>User</th><th>Email</th><th>Role</th><th>Team</th><th>Status</th><th>Last Active</th><th className="users-mfa">MFA</th><th /></tr></thead><tbody>{isLoading ? <tr><td className="users-empty" colSpan={9}>Loading users...</td></tr> : loadError ? <tr><td className="users-empty" colSpan={9}>{loadError}</td></tr> : filteredUsers.map((user) => <UserRow user={user} selected={selected.includes(user.id)} actionOpen={actionId === user.id} onSelect={toggleSelected} onAction={() => setActionId(actionId === user.id ? "" : user.id)} onStatus={() => updateStatus(user)} onResetMfa={() => resetMfa(user)} onRoleChange={(role) => changeRole(user, role)} onResend={() => resendInvitation(user)} key={user.id} />)}{!isLoading && !loadError && !filteredUsers.length ? <tr><td className="users-empty" colSpan={9}><Search size={18} /><strong>No users found</strong><span>Try another search or filter.</span></td></tr> : null}</tbody></table></div><footer className="users-pagination"><span>Showing <strong>{filteredUsers.length ? 1 : 0}</strong> to <strong>{filteredUsers.length}</strong> of <strong>{users.length}</strong> entries</span><div><button type="button" aria-label="Previous page" disabled><ChevronLeft size={14} /></button><button className="active" type="button">1</button><button type="button" onClick={() => setNotice("Page 2 is ready for API pagination.")}>2</button><button type="button" onClick={() => setNotice("Page 3 is ready for API pagination.")}>3</button><button type="button" aria-label="Next page" onClick={() => setNotice("Next page is ready for API pagination.")}><ChevronRight size={14} /></button></div></footer></section></> : <AdminTabPanel title={activeTab} onInvite={() => setInviteOpen(true)} />}
        {inviteOpen ? <InviteModal onClose={() => setInviteOpen(false)} onSubmit={sendInvite} /> : null}
        {notice ? <div className="users-toast" role="status"><CheckCircle2 size={15} />{notice}<button type="button" aria-label="Dismiss notice" onClick={() => setNotice("")}><X size={14} /></button></div> : null}
      </div>
    </AppShell>
  );
}

function UserRow({ user, selected, actionOpen, onSelect, onAction, onStatus, onResetMfa, onRoleChange, onResend }: { user: UserRecord; selected: boolean; actionOpen: boolean; onSelect: (id: string) => void; onAction: () => void; onStatus: () => void; onResetMfa: () => void; onRoleChange: (role: string) => void; onResend: () => void }) {
  return <tr className={user.status === "Suspended" ? "suspended-row" : ""}><td className="users-check"><input type="checkbox" aria-label={"Select " + user.name} checked={selected} onChange={() => onSelect(user.id)} /></td><td><div className="user-cell"><span className={"user-avatar " + user.tone}>{user.invitation ? <Mail size={13} /> : user.initials}</span><strong>{user.name}</strong></div></td><td>{user.email}</td><td><select className="user-role-select" aria-label={"Role for " + user.name} value={user.role} onChange={(event) => onRoleChange(event.target.value)}><option>Admin</option><option>HR Manager</option><option>HR Reviewer</option><option>Auditor</option></select></td><td>{user.team}</td><td><span className={"user-status " + user.status.toLowerCase()}>{user.status === "Active" ? <CheckCircle2 size={11} /> : user.status === "Pending" ? <Clock3 size={11} /> : <span className="status-dot" />}{user.status}</span></td><td>{user.lastActive}</td><td className="users-mfa">{user.mfa ? <ShieldCheck size={15} className="mfa-on" /> : <span className="mfa-off">-</span>}</td><td className="user-action-cell">{user.invitation ? <button className="resend-button" type="button" onClick={onResend}>Resend</button> : <><button className="user-action-button" type="button" aria-label={"Actions for " + user.name} onClick={onAction}><MoreVertical size={15} /></button>{actionOpen ? <div className="user-action-menu"><button type="button" onClick={() => onRoleChange(user.role === "Admin" ? "HR Manager" : "Admin")}>Change role</button><button type="button" onClick={onStatus}>{user.status === "Suspended" ? "Reactivate" : "Suspend user"}</button><button type="button" onClick={onResetMfa}>Reset MFA</button><Link href="/admin/audit-logs" onClick={onAction}><History size={12} />View activity</Link></div> : null}</>}</td></tr>;
}

function InviteModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void }) {
  return <div className="users-modal-backdrop"><form className="invite-user-modal" onSubmit={onSubmit}><header><h2>Invite User</h2><button type="button" aria-label="Close invite dialog" onClick={onClose}><X size={16} /></button></header><div className="invite-form-body"><label>Email Address<input name="email" type="email" placeholder="name@company.com" required /></label><div className="invite-two-columns"><label>Role<select name="role"><option>HR Reviewer</option><option>HR Manager</option><option>Auditor</option><option>Admin</option></select></label><label>Team<select name="team"><option>Engineering</option><option>Sales</option><option>Marketing</option><option>Global</option></select></label></div><label>Invitation Expiration<select name="expiration"><option>7 Days</option><option>14 Days</option><option>30 Days</option></select></label><div className="invite-info"><ShieldCheck size={15} /><span>An email will be sent with a secure link to create an account. MFA will be required on first login.</span></div></div><footer><button className="button" type="button" onClick={onClose}>Cancel</button><button className="button primary" type="submit">Send Invite</button></footer></form></div>;
}

function AdminTabPanel({ title, onInvite }: { title: string; onInvite: () => void }) {
  return <section className="admin-tab-panel"><SettingsIcon /><div><h2>{title}</h2><p>Manage access policies, permission sets and pending invitations from the administration workspace.</p><button className="button primary" type="button" onClick={onInvite}><Plus size={14} />Create invite</button><Link href="/admin/audit-logs">Open audit logs <ChevronRight size={13} /></Link></div></section>;
}

function SettingsIcon() {
  return <span className="admin-tab-icon"><ShieldCheck size={22} /></span>;
}

function toUserRecord(user: ApiAdminUser): UserRecord {
  const status = user.status.toLowerCase();
  const displayStatus: UserStatus = status === "suspended" ? "Suspended" : status === "pending" ? "Pending" : "Active";
  return { id: user.id, name: user.name, email: user.email, role: user.roles[0] ?? "HR Reviewer", team: user.team ?? "-", status: displayStatus, lastActive: user.lastActiveAt ? new Date(user.lastActiveAt).toLocaleString() : "-", mfa: user.mfaEnabled, initials: user.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase(), tone: "blue" };
}
