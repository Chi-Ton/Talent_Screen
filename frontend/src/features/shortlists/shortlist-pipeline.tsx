"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type DragEvent } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Download,
  FileText,
  GripVertical,
  List,
  MoreHorizontal,
  Plus,
  Search,
  Star,
  UserPlus,
  X,
  XCircle
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ApiError } from "@/lib/api-client";
import { fetchCandidates, type ApiCandidate } from "@/features/candidates/candidates-api";
import { addShortlists, fetchShortlists, moveShortlistStage, type ApiShortlistItem } from "@/features/shortlists/shortlist-api";

type Stage = "Shortlisted" | "HR Review" | "HM Review" | "Interview" | "Offer" | "Rejected";

type PipelineCandidate = {
  id: string;
  score?: number;
  recommendation: string;
  added: string;
  skills: string[];
  task: string;
  owner: string;
  tone?: "danger" | "muted";
};

const stages: { key: Stage; label: string; tone?: string }[] = [
  { key: "Shortlisted", label: "Shortlisted" },
  { key: "HR Review", label: "HR Review" },
  { key: "HM Review", label: "HM Review" },
  { key: "Interview", label: "Interview" },
  { key: "Offer", label: "Offer" },
  { key: "Rejected", label: "Rejected", tone: "rejected" }
];

const initialPipeline: Record<Stage, PipelineCandidate[]> = {
  Shortlisted: [
    { id: "C-1042", score: 89, recommendation: "Strong Recommend", added: "Added 2d ago", skills: ["Java", "Spring Boot", "AWS"], task: "Schedule Review", owner: "JD" },
    { id: "C-2991", score: 82, recommendation: "Recommend", added: "Added 3d ago", skills: ["Java", "Microservices"], task: "Awaiting Docs", owner: "AK" }
  ],
  "HR Review": [
    { id: "C-0882", score: 94, recommendation: "Strong Recommend", added: "Overdue 2d", skills: ["Java", "System Design"], task: "Complete Initial Screen", owner: "JD", tone: "danger" }
  ],
  "HM Review": [
    { id: "C-4410", score: 76, recommendation: "Needs Review", added: "In stage 5d", skills: ["Java", "Hibernate"], task: "HM Feedback Required", owner: "MS", tone: "muted" }
  ],
  Interview: [{ id: "C-9921", recommendation: "Scheduled", added: "Tomorrow, 10:00 AM", skills: ["Java", "AWS"], task: "Technical Interview", owner: "JD" }],
  Offer: [],
  Rejected: [{ id: "C-1122", recommendation: "Rejected", added: "Rejected yesterday", skills: [], task: "Archived", owner: "" }]
};

const addableCandidates: PipelineCandidate[] = [
  { id: "T-9921", score: 92, recommendation: "Strong Recommend", added: "Available", skills: ["Java", "AWS", "Kafka"], task: "Ready to add", owner: "" },
  { id: "C-8104", score: 91, recommendation: "Strong Recommend", added: "Available", skills: ["Java", "PostgreSQL", "Docker"], task: "Ready to add", owner: "" },
  { id: "C-7452", score: 84, recommendation: "Recommend", added: "Available", skills: ["Spring Boot", "AWS"], task: "Ready to add", owner: "" }
];

export function ShortlistPipeline() {
  const [pipeline, setPipeline] = useState<Record<Stage, PipelineCandidate[]>>({ Shortlisted: [], "HR Review": [], "HM Review": [], Interview: [], Offer: [], Rejected: [] });
  const [sourceItems, setSourceItems] = useState<ApiShortlistItem[]>([]);
  const [candidatePool, setCandidatePool] = useState<ApiCandidate[]>([]);
  const [selectedJob, setSelectedJob] = useState("All Jobs");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [viewMode, setViewMode] = useState<"board" | "list">("board");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerQuery, setDrawerQuery] = useState("");
  const [draggedId, setDraggedId] = useState("");
  const [rejectId, setRejectId] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([fetchShortlists(), fetchCandidates()]).then(([items, candidates]) => {
      if (!active) return;
      setSourceItems(items);
      setCandidatePool(candidates);
      setSelectedJob(items[0]?.jobTitle ?? "All Jobs");
    }).catch((error: unknown) => {
      if (active) setLoadError(error instanceof ApiError ? error.message : "Unable to load the shortlist pipeline.");
    }).finally(() => {
      if (active) setIsLoading(false);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const visibleItems = sourceItems.filter((item) => selectedJob === "All Jobs" || item.jobTitle === selectedJob);
    setPipeline(toPipeline(visibleItems));
  }, [selectedJob, sourceItems]);

  const allCandidates = stages.flatMap((stage) => pipeline[stage.key]);
  const availableCandidates = candidatePool.filter((candidate) => (selectedJob === "All Jobs" || candidate.targetRole === selectedJob) && !allCandidates.some((item) => item.id === candidate.id) && (candidate.id + " " + candidate.name + " " + candidate.matchedSkills.join(" ")).toLowerCase().includes(drawerQuery.toLowerCase())).map(toPipelineCandidate);
  const candidateCount = allCandidates.length;

  function moveCandidate(id: string, targetStage: Stage) {
    let moving: PipelineCandidate | undefined;
    const nextPipeline = { ...pipeline };
    stages.forEach((stage) => {
      const existing = nextPipeline[stage.key].find((candidate) => candidate.id === id);
      if (existing) moving = existing;
      nextPipeline[stage.key] = nextPipeline[stage.key].filter((candidate) => candidate.id !== id);
    });
    if (!moving) return;
    nextPipeline[targetStage] = [...nextPipeline[targetStage], moving];
    setPipeline(nextPipeline);
    void moveShortlistStage(id, stageToApiValue(targetStage)).catch((error: unknown) => setNotice(error instanceof ApiError ? error.message : "Unable to save the pipeline stage."));
    setNotice(id + " moved to " + targetStage + ".");
  }

  function handleDrop(event: DragEvent<HTMLElement>, stage: Stage) {
    event.preventDefault();
    if (draggedId) moveCandidate(draggedId, stage);
    setDraggedId("");
  }

  async function addCandidate(candidate: PipelineCandidate) {
    try {
      await addShortlists([candidate.id]);
      setPipeline((current) => ({ ...current, Shortlisted: [...current.Shortlisted, candidate] }));
      setNotice(candidate.id + " added to Shortlisted.");
      setDrawerOpen(false);
      setDrawerQuery("");
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : "Unable to add candidate to shortlist.");
    }
  }

  function confirmReject() {
    if (!rejectId || !rejectReason) {
      setNotice("Select a rejection reason before confirming.");
      return;
    }
    moveCandidate(rejectId, "Rejected");
    setRejectId("");
    setRejectReason("");
  }

  function exportShortlist() {
    const rows = ["Candidate,Stage,Score,Recommendation,Skills,Task", ...stages.flatMap((stage) => pipeline[stage.key].map((candidate) => [candidate.id, stage.label, candidate.score ?? "", candidate.recommendation, candidate.skills.join(" | "), candidate.task].map((value) => '"' + value + '"').join(",")))];
    const url = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "shortlist-pipeline.csv";
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice("Shortlist pipeline exported as CSV.");
  }

  return (
    <AppShell activePath="/shortlists" breadcrumb="Recruitment / Shortlists">
      <div className="shortlist-pipeline-page">
        <header className="shortlist-pipeline-header"><div className="shortlist-breadcrumb"><Link href="/dashboard">Recruitment</Link><ChevronRight size={14} /><strong>Shortlists</strong></div><div className="shortlist-title-row"><div><h1>Shortlist Pipeline</h1><p>Move selected candidates through shortlist stages and keep hiring decisions visible.</p></div><div className="shortlist-controls"><select aria-label="Select job" value={selectedJob} onChange={(event) => setSelectedJob(event.target.value)}><option>All Jobs</option>{Array.from(new Set(sourceItems.map((item) => item.jobTitle))).map((item) => <option key={item}>{item}</option>)}</select><span className="shortlist-count">{candidateCount} Candidates</span><div className="shortlist-view-toggle"><button className={viewMode === "list" ? "active" : ""} type="button" aria-label="List view" onClick={() => setViewMode("list")}><List size={15} /></button><button className={viewMode === "board" ? "active" : ""} type="button" aria-label="Board view" onClick={() => setViewMode("board")}><GripVertical size={15} /></button></div><button className="button" type="button" onClick={exportShortlist}><Download size={14} />Export Shortlist</button><button className="button primary" type="button" onClick={() => setDrawerOpen(true)}><UserPlus size={14} />Add Candidates</button></div></div></header>
        {isLoading ? <div className="shortlist-empty-stage" role="status">Loading shortlist pipeline...</div> : loadError ? <div className="shortlist-empty-stage" role="alert">{loadError}</div> : null}
        {viewMode === "board" ? <div className="shortlist-board">{stages.map((stage) => <PipelineColumn key={stage.key} stage={stage} candidates={pipeline[stage.key]} onDrop={handleDrop} onDragStart={setDraggedId} onMove={moveCandidate} onReject={setRejectId} />)}</div> : <PipelineList pipeline={pipeline} onMove={moveCandidate} onReject={setRejectId} />}

        {drawerOpen ? <aside className="shortlist-drawer" aria-label="Add candidates panel"><header><h2>Add Candidates</h2><button type="button" aria-label="Close add candidates" onClick={() => setDrawerOpen(false)}><X size={17} /></button></header><div className="shortlist-drawer-body"><p>Search the database or import new profiles to add to the <strong>{selectedJob}</strong> shortlist.</p><div className="shortlist-drawer-search"><Search size={15} /><input placeholder="Search by skills, name, ID..." value={drawerQuery} onChange={(event) => setDrawerQuery(event.target.value)} /></div><div className="shortlist-add-results">{availableCandidates.length ? availableCandidates.map((candidate) => <div className="shortlist-add-result" key={candidate.id}><span className="shortlist-add-avatar">{candidate.id.slice(-2)}</span><div><strong>{candidate.id}</strong><small>Match: {candidate.score}% · {candidate.skills.join(", ")}</small></div><button type="button" aria-label={"Add " + candidate.id} onClick={() => addCandidate(candidate)}><Plus size={16} /></button></div>) : <div className="shortlist-no-results">No available candidates match this search.</div>}</div></div><footer><button className="shortlist-import" type="button" onClick={() => setNotice("CSV import is ready for backend integration.")}><FileText size={14} />Import CSV</button><button className="button" type="button" onClick={() => setDrawerOpen(false)}>Done</button></footer></aside> : null}
        {rejectId ? <div className="shortlist-modal-backdrop"><section className="shortlist-modal" role="dialog" aria-modal="true" aria-labelledby="reject-title"><header><h2 id="reject-title"><XCircle size={17} />Move to Rejected</h2><button type="button" aria-label="Close rejection modal" onClick={() => setRejectId("")}><X size={16} /></button></header><div><p>You are about to move candidate <strong>{rejectId}</strong> to the Rejected stage.</p><label>Rejection Reason<select value={rejectReason} onChange={(event) => setRejectReason(event.target.value)}><option value="">Select a reason...</option><option>Lacks Required Technical Skills</option><option>Salary Expectations Mismatch</option><option>Cultural Fit</option><option>Candidate Withdrew</option></select></label><label>Internal Notes (Optional)<textarea placeholder="Add notes for the hiring team..." /></label></div><footer><button className="button" type="button" onClick={() => setRejectId("")}>Cancel</button><button className="button danger" type="button" onClick={confirmReject}>Confirm Rejection</button></footer></section></div> : null}
        {notice ? <div className="shortlist-toast" role="status"><CheckCircle2 size={15} />{notice}<button type="button" aria-label="Dismiss notice" onClick={() => setNotice("")}><X size={14} /></button></div> : null}
      </div>
    </AppShell>
  );
}

function PipelineColumn({ stage, candidates, onDrop, onDragStart, onMove, onReject }: { stage: { key: Stage; label: string; tone?: string }; candidates: PipelineCandidate[]; onDrop: (event: DragEvent<HTMLElement>, stage: Stage) => void; onDragStart: (id: string) => void; onMove: (id: string, stage: Stage) => void; onReject: (id: string) => void }) {
  return <section className={"shortlist-column " + (stage.tone ?? "")} onDragOver={(event) => event.preventDefault()} onDrop={(event) => onDrop(event, stage.key)}><header><h2>{stage.label}<span>{candidates.length}</span></h2><button type="button" aria-label={stage.label + " actions"}><MoreHorizontal size={17} /></button></header><div className="shortlist-column-body">{candidates.length ? candidates.map((candidate) => <PipelineCard candidate={candidate} stage={stage.key} key={candidate.id} onDragStart={onDragStart} onMove={onMove} onReject={onReject} />) : <div className="shortlist-empty-stage"><InboxIcon /><span>No candidates in this stage</span></div>}</div></section>;
}

function PipelineCard({ candidate, stage, onDragStart, onMove, onReject }: { candidate: PipelineCandidate; stage: Stage; onDragStart: (id: string) => void; onMove: (id: string, stage: Stage) => void; onReject: (id: string) => void }) {
  return <article className={"shortlist-candidate-card " + (candidate.tone ?? "") + (stage === "Rejected" ? " rejected-card" : "")} draggable={stage !== "Rejected"} onDragStart={() => onDragStart(candidate.id)}><div className="shortlist-card-top"><div className="shortlist-card-person"><span className="shortlist-card-avatar">{candidate.id.slice(-1)}</span><div><Link href={"/candidates/" + candidate.id + "/profile"}>{candidate.id}</Link><small>{candidate.added}</small></div></div>{candidate.score ? <span className="shortlist-card-score"><Star size={12} />{candidate.score}%</span> : null}</div><div className="shortlist-card-middle"><strong>{candidate.recommendation}</strong><div>{candidate.skills.map((skill) => <span key={skill}>{skill}</span>)}</div></div><div className="shortlist-card-footer"><span><i>{candidate.owner || "--"}</i>{candidate.task}</span>{stage !== "Rejected" ? <div className="shortlist-card-actions"><button type="button" aria-label={"Move " + candidate.id + " to next stage"} onClick={() => onMove(candidate.id, nextStage(stage))}><ArrowRight size={13} /></button><button type="button" aria-label={"Reject " + candidate.id} onClick={() => onReject(candidate.id)}><MoreHorizontal size={14} /></button></div> : null}</div></article>;
}

function nextStage(stage: Stage): Stage {
  const index = stages.findIndex((item) => item.key === stage);
  return stages[Math.min(stages.length - 1, index + 1)].key;
}

function PipelineList({ pipeline, onMove, onReject }: { pipeline: Record<Stage, PipelineCandidate[]>; onMove: (id: string, stage: Stage) => void; onReject: (id: string) => void }) {
  return <section className="shortlist-list-view"><div className="shortlist-list-heading"><span>Candidate</span><span>Stage</span><span>Score</span><span>Recommendation</span><span>Skills</span><span>Actions</span></div>{stages.flatMap((stage) => pipeline[stage.key].map((candidate) => <div className="shortlist-list-row" key={candidate.id}><Link href={"/candidates/" + candidate.id + "/profile"}>{candidate.id}</Link><span>{stage.label}</span><strong>{candidate.score ? candidate.score + "%" : "-"}</strong><span>{candidate.recommendation}</span><span>{candidate.skills.join(", ") || "-"}</span><div><button type="button" onClick={() => onMove(candidate.id, nextStage(stage.key))}><ArrowRight size={14} /></button><button type="button" onClick={() => onReject(candidate.id)}><XCircle size={14} /></button></div></div>))}</section>;
}

function InboxIcon() {
  return <span className="shortlist-inbox-icon"><Star size={19} /></span>;
}

function toPipeline(items: ApiShortlistItem[]): Record<Stage, PipelineCandidate[]> {
  const result: Record<Stage, PipelineCandidate[]> = { Shortlisted: [], "HR Review": [], "HM Review": [], Interview: [], Offer: [], Rejected: [] };
  items.forEach((item) => {
    const stage = apiStageToUi(item.stage);
    result[stage].push({ id: item.candidateId, score: Math.round(item.score), recommendation: formatRecommendation(item.recommendation), added: formatDate(item.updatedAt), skills: item.matchedSkills, task: stage === "Rejected" ? "Archived" : "Review required", owner: "" });
  });
  return result;
}

function toPipelineCandidate(candidate: ApiCandidate): PipelineCandidate {
  return { id: candidate.id, score: candidate.score === null ? undefined : Math.round(candidate.score), recommendation: formatRecommendation(candidate.recommendation), added: "Available", skills: candidate.matchedSkills, task: "Ready to add", owner: "" };
}

function apiStageToUi(stage: string): Stage {
  if (stage === "hr_review") return "HR Review";
  if (stage === "hiring_manager_review") return "HM Review";
  if (stage === "interview") return "Interview";
  if (stage === "offer") return "Offer";
  if (stage === "rejected") return "Rejected";
  return "Shortlisted";
}

function stageToApiValue(stage: Stage) {
  return { Shortlisted: "shortlisted", "HR Review": "hr_review", "HM Review": "hiring_manager_review", Interview: "interview", Offer: "offer", Rejected: "rejected" }[stage];
}

function formatRecommendation(value: string | null) {
  if (!value) return "Pending review";
  return value.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function formatDate(value: string) {
  return "Updated " + new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
