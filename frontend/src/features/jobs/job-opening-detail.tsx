"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Activity,
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  CloudUpload,
  Copy,
  Download,
  Eye,
  FileText,
  History,
  MapPin,
  Pencil,
  Power,
  ShieldCheck,
  Star,
  Trophy,
  UserRound,
  UsersRound
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ApiError } from "@/lib/api-client";
import { fetchCandidates, type ApiCandidate } from "@/features/candidates/candidates-api";
import { fetchJob, type ApiJob } from "@/features/jobs/jobs-api";

type DetailTab = "Overview" | "Criteria & Scoring" | "Candidates" | "Batches" | "Activity";

const candidates = [
  { rank: 1, id: "CAND-8992", score: 94, recommendation: "Strong Hire" },
  { rank: 2, id: "CAND-8104", score: 92, recommendation: "Strong Hire" },
  { rank: 3, id: "CAND-7441", score: 88, recommendation: "Hire" },
  { rank: 4, id: "CAND-8902", score: 85, recommendation: "Hire" },
  { rank: 5, id: "CAND-7719", score: 83, recommendation: "Hire" }
];

const batches = [
  { id: "BAT-001", date: "Latest batch", files: "- CVs", status: "Queued" }
];

const weights = [
  { label: "Tech", value: 40, color: "blue" },
  { label: "Exp.", value: 25, color: "teal" },
  { label: "Projects", value: 15, color: "sky" },
  { label: "Systems", value: 10, color: "orange" },
  { label: "Edu.", value: 10, color: "slate" }
];

export function JobOpeningDetail({ jobId }: { jobId: string }) {
  const [job, setJob] = useState<ApiJob | null>(null);
  const [loadError, setLoadError] = useState("");
  const [activeTab, setActiveTab] = useState<DetailTab>("Overview");
  const [status, setStatus] = useState("Active");
  const displayJobId = jobId || "JD-002";

  useEffect(() => {
    let active = true;
    fetchJob(displayJobId).then((value) => {
      if (active) {
        setJob(value);
        setStatus(value.status === "active" ? "Active" : value.status.charAt(0).toUpperCase() + value.status.slice(1));
      }
    }).catch((error: unknown) => {
      if (active) setLoadError(error instanceof ApiError ? error.message : "Unable to load this job opening.");
    });
    return () => { active = false; };
  }, [displayJobId]);

  const title = job?.title ?? "Java Backend Engineer";
  const displayStatus = status;

  return (
    <AppShell activePath="/jobs" breadcrumb="Recruitment / Job Openings / Job Detail">
      <div className="detail-page">
        <header className="detail-header">
          <nav className="create-job-breadcrumb" aria-label="Breadcrumb"><Link href="/jobs">Recruitment</Link><ChevronRight size={14} aria-hidden="true" /><Link href="/jobs">Job Openings</Link><ChevronRight size={14} aria-hidden="true" /><strong>{title}</strong></nav>
          <div className="detail-title-row">
            <div><div className="detail-title-line"><h1 className="page-title">{title}</h1><span className={"detail-status " + displayStatus.toLowerCase()}>{displayStatus}</span><span className="detail-id">{displayJobId}</span></div><div className="detail-meta"><span><UserRound size={16} aria-hidden="true" />Owner: <strong>{job?.ownerName ?? "-"}</strong></span><span><CalendarDays size={16} aria-hidden="true" />Created: <strong>{job?.createdAt ? new Date(job.createdAt).toLocaleDateString() : "-"}</strong></span></div></div>
            <div className="detail-actions"><Link className="button" href={"/jobs/new/basic-info?jobId=" + displayJobId}><Pencil size={15} aria-hidden="true" />Edit</Link><button className="button" type="button" onClick={() => setStatus((current) => current === "Active" ? "Closed" : "Active")}><Power size={15} aria-hidden="true" />{status === "Active" ? "Close job" : "Reopen job"}</button><Link className="button primary" href={"/batches/upload?jobId=" + displayJobId}><CloudUpload size={15} aria-hidden="true" />Upload CVs</Link></div>
          </div>
          <nav className="detail-tabs" aria-label="Job detail views">{(["Overview", "Criteria & Scoring", "Candidates", "Batches", "Activity"] as DetailTab[]).map((tab) => <button className={activeTab === tab ? "active" : ""} type="button" key={tab} onClick={() => setActiveTab(tab)}>{tab}</button>)}</nav>
        </header>

        {loadError ? <div className="detail-empty-state" role="alert">{loadError}</div> : null}
        {activeTab === "Overview" ? <OverviewTab displayJobId={displayJobId} job={job} /> : null}
        {activeTab === "Criteria & Scoring" ? <CriteriaTab /> : null}
        {activeTab === "Candidates" ? <CandidatesTab /> : null}
        {activeTab === "Batches" ? <BatchesTab /> : null}
        {activeTab === "Activity" ? <ActivityTab displayJobId={displayJobId} /> : null}
      </div>
    </AppShell>
  );
}

function OverviewTab({ displayJobId, job }: { displayJobId: string; job: ApiJob | null }) {
  const [topCandidates, setTopCandidates] = useState<ApiCandidate[]>([]);

  useEffect(() => {
    let active = true;
    fetchCandidates(displayJobId).then((items) => { if (active) setTopCandidates(items.slice(0, 5)); }).catch(() => undefined);
    return () => { active = false; };
  }, [displayJobId]);

  const totalCandidates = job?.candidateCount ?? 0;
  const strongMatches = job?.strongMatches ?? 0;
  const averageScore = job?.averageScore ?? 0;
  return <main className="detail-content">
    <section className="detail-kpis" aria-label="Job metrics">
      <Link className="detail-kpi" href={"/candidates/ranked?jobId=" + displayJobId}><span><UsersRound size={16} />Total Candidates</span><strong>{totalCandidates}</strong></Link>
      <Link className="detail-kpi" href={"/candidates/ranked?jobId=" + displayJobId}><span><Activity size={16} />AI Processed</span><strong>{totalCandidates}</strong><small>{totalCandidates ? "100% completion" : "No candidates yet"}</small></Link>
      <Link className="detail-kpi accent-teal" href={"/candidates/ranked?jobId=" + displayJobId + "&score=85"}><span><CheckCircle2 size={16} />Strong Matches</span><strong>{strongMatches}</strong><small>Score &gt; 85%</small></Link>
      <Link className="detail-kpi accent-blue" href={"/shortlists?jobId=" + displayJobId}><span><Star size={16} />Average Score</span><strong>{averageScore}%</strong><small>Across candidates</small></Link>
    </section>
    <section className="detail-progress-card"><div><h2>Screening Progress</h2><p>Processing CVs against job criteria</p></div><strong>{totalCandidates} / {totalCandidates} completed</strong><div className="detail-progress-track"><span style={{ width: totalCandidates ? "100%" : "0%" }} /></div></section>
    <div className="detail-bento"><div className="detail-left-column"><TopCandidates candidates={topCandidates} /><RecentBatches /></div><div className="detail-right-column"><JobInfoCard displayJobId={displayJobId} job={job} /><TargetProfile /><ActivityCard displayJobId={displayJobId} /></div></div>
  </main>;
}

function TopCandidates({ candidates: candidateItems = [] }: { candidates?: ApiCandidate[] }) {
  return <section className="detail-card table-card"><header className="detail-card-header"><h2><Trophy size={16} aria-hidden="true" />Top 5 Candidates</h2><Link href="/results">View all candidates<ArrowRight size={14} /></Link></header><div className="detail-table-wrap"><table className="detail-table"><thead><tr><th>Rank</th><th>Candidate</th><th>Overall Score</th><th>Recommendation</th><th className="align-right">Actions</th></tr></thead><tbody>{candidateItems.map((candidate, index) => <tr key={candidate.id}><td><strong>#{candidate.rank ?? index + 1}</strong></td><td><Link href={"/candidates/" + candidate.id + "/profile"}>{candidate.displayName || candidate.name}</Link></td><td><span className={"candidate-score " + (candidate.score !== null && candidate.score >= 90 ? "high" : "")}>{candidate.score === null ? "Not scored" : `${Math.round(candidate.score)}%`}</span></td><td><span className={"recommendation " + (candidate.recommendation === "strong_recommend" ? "strong" : "")}>{candidate.recommendation ?? "Review Needed"}</span></td><td className="align-right"><Link className="icon-link" href={"/candidates/" + candidate.id + "/profile"} aria-label={"View " + candidate.name}><Eye size={17} /></Link></td></tr>)}</tbody></table></div></section>;
}

function RecentBatches() {
  return <section className="detail-card table-card"><header className="detail-card-header"><h2><FileText size={16} aria-hidden="true" />Recent Screening Batches</h2></header><div className="detail-table-wrap"><table className="detail-table"><thead><tr><th>Batch ID</th><th>Upload Date</th><th>Files</th><th>Status</th><th className="align-right">Action</th></tr></thead><tbody>{batches.map((batch) => <tr key={batch.id}><td><Link href={"/batches/" + batch.id}>{batch.id}</Link></td><td className="muted-cell">{batch.date}</td><td>{batch.files}</td><td><span className={"batch-status " + (batch.status === "Completed" ? "completed" : "processing")}>{batch.status}</span></td><td className="align-right"><Link className="table-action-link" href={"/batches/" + batch.id}>Open batch</Link></td></tr>)}</tbody></table></div></section>;
}

function JobInfoCard({ displayJobId, job }: { displayJobId: string; job: ApiJob | null }) {
  return <section className="detail-card"><div className="context-actions"><Link href={"/jobs/new/basic-info?duplicateJobId=" + displayJobId}><Copy size={16} aria-hidden="true" /><span>Duplicate</span></Link><Link href="/reports"><Download size={16} aria-hidden="true" /><span>Export Config</span></Link></div><div className="detail-info-section"><h2>Job Details</h2><p><span><BarChart3 size={15} />Department</span><strong>{job?.department ?? "-"}</strong></p><p><span><ClipboardList size={15} />Employment</span><strong>{job?.employmentType ?? "-"}</strong></p><p><span><MapPin size={15} />Location</span><strong>{job?.location ?? job?.workMode ?? "-"}</strong></p></div></section>;
}

function TargetProfile() {
  return <section className="detail-card"><h2 className="detail-section-title"><ShieldCheck size={16} aria-hidden="true" />Target Profile</h2><div className="profile-group"><span>Must-have Skills</span><div className="detail-chips"><i>Java</i><i>Spring Boot</i><i>PostgreSQL</i><i>Hibernate</i></div></div><div className="profile-group"><span>Nice-to-have Skills</span><div className="detail-chips dashed"><i>Kafka</i><i>Redis</i><i>Docker</i><i>AWS</i></div></div><div className="detail-weight-section"><span>AI Score Weights</span>{weights.map((weight) => <div className="mini-weight" key={weight.label}><small>{weight.label}</small><div><i className={weight.color} style={{ width: weight.value + "%" }} /></div><strong>{weight.value}%</strong></div>)}</div></section>;
}

function ActivityCard({ displayJobId }: { displayJobId: string }) {
  return <section className="detail-card"><h2 className="detail-section-title"><History size={16} aria-hidden="true" />Recent Activity</h2><ActivityTimeline displayJobId={displayJobId} /></section>;
}

function ActivityTimeline({ displayJobId }: { displayJobId: string }) {
  return <div className="detail-timeline"><div><span>Latest activity</span><p>Batch <Link href="/batches/BAT-001">BAT-001</Link> is linked to this opening.</p></div><div><span>Screening workflow</span><p>Candidate parsing and scoring are available from the batch monitor.</p></div><div><span>Job opening</span><p>Job {displayJobId} is managed through the configured screening criteria.</p></div></div>;
}

function CriteriaTab() {
  return <main className="detail-content tab-content"><section className="detail-card"><header className="detail-card-header"><h2><ClipboardList size={16} />Criteria &amp; Scoring</h2><Link href="/jobs/new/screening-criteria"><Pencil size={14} />Edit criteria</Link></header><div className="criteria-tab-grid"><div><h3>Must-have Skills</h3><div className="detail-chips"><i>Java</i><i>Spring Boot</i><i>PostgreSQL</i><i>System Design</i></div></div><div><h3>Nice-to-have Skills</h3><div className="detail-chips dashed"><i>Kafka</i><i>Redis</i><i>Docker</i><i>AWS</i></div></div></div></section><section className="detail-card"><header className="detail-card-header"><h2><BarChart3 size={16} />AI Score Weights</h2><Link href="/jobs/new/scoring-weights">Configure<ArrowRight size={14} /></Link></header><div className="large-weight-list">{weights.map((weight) => <div key={weight.label}><span>{weight.label}</span><div><i className={weight.color} style={{ width: weight.value + "%" }} /></div><strong>{weight.value}%</strong></div>)}</div></section></main>;
}

function CandidatesTab() {
  return <main className="detail-content tab-content"><TopCandidates /><section className="detail-card tab-callout"><UsersRound size={18} /><div><h2>Candidate review workspace</h2><p>Open the ranked candidate view to compare profiles, review AI match explanations and shortlist qualified candidates.</p><Link href="/candidates/ranked">Open ranked candidates<ArrowRight size={14} /></Link></div></section></main>;
}

function BatchesTab() {
  return <main className="detail-content tab-content"><RecentBatches /><Link className="button primary detail-tab-action" href="/batches/upload"><CloudUpload size={15} />Upload another batch</Link></main>;
}

function ActivityTab({ displayJobId }: { displayJobId: string }) {
  return <main className="detail-content tab-content"><section className="detail-card activity-tab-card"><header className="detail-card-header"><h2><History size={16} />Complete Activity Log</h2><Link href="/admin/audit-logs">Open audit logs<ArrowRight size={14} /></Link></header><ActivityTimeline displayJobId={displayJobId} /></section></main>;
}
