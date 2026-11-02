"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Brain,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  History,
  RefreshCw,
  ShieldCheck,
  Star,
  UserRound,
  X,
  XCircle
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ApiError } from "@/lib/api-client";
import { addApplicationsToShortlist, fetchCandidate, moveApplicationStage, removeApplicationFromShortlist, rescoreCandidate, type ApiCandidate } from "@/features/candidates/candidates-api";
import { formatCandidateScore } from "@/features/candidates/candidate-format";

export function CandidateMatchAnalysis({ candidateId = "CAND-JAVA-001", jobId }: { candidateId?: string; jobId?: string }) {
  const [candidate, setCandidate] = useState<ApiCandidate | null>(null);
  const [loadError, setLoadError] = useState("");
  const [shortlisted, setShortlisted] = useState(false);
  const [rescoreState, setRescoreState] = useState("Rescore");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    fetchCandidate(candidateId, jobId).then((value) => {
      if (!active) return;
      setCandidate(value);
      setShortlisted(value.pipelineStage === "shortlisted");
    }).catch((error: unknown) => { if (active) setLoadError(error instanceof ApiError ? error.message : "Unable to load candidate analysis."); });
    return () => { active = false; };
  }, [candidateId, jobId]);

  async function rescore() {
    setRescoreState("Scoring...");
    try {
      await rescoreCandidate(candidateId, jobId);
      const refreshed = await fetchCandidate(candidateId, jobId);
      setCandidate(refreshed);
      setRescoreState("Rescored");
      setNotice(`AI match analysis refreshed with ${refreshed.screening?.modelName ?? "the configured model"}.`);
    } catch (error) {
      setRescoreState("Rescore");
      setNotice(error instanceof ApiError ? error.message : "Unable to rescore this candidate.");
    }
  }

  async function setHrDecision(stage: "hr_review" | "rejected", successMessage: string) {
    if (!candidate?.applicationId) return;
    try {
      await moveApplicationStage(candidate.applicationId, stage);
      setCandidate((current) => current ? { ...current, pipelineStage: stage } : current);
      setShortlisted(false);
      setNotice(successMessage);
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : "Unable to save the HR decision.");
    }
  }

  async function toggleShortlist() {
    if (!candidate?.applicationId) return;
    const nextValue = !shortlisted;
    try {
      if (nextValue) await addApplicationsToShortlist([candidate.applicationId]);
      else await removeApplicationFromShortlist(candidate.applicationId);
      setShortlisted(nextValue);
      setCandidate((current) => current ? { ...current, pipelineStage: nextValue ? "shortlisted" : "hr_review" } : current);
      setNotice(nextValue ? "Candidate added to shortlist." : "Candidate removed from shortlist.");
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : "Unable to update shortlist.");
    }
  }

  return (
    <AppShell activePath="/results" breadcrumb="CV Screening / Match Analysis">
      <div className="match-analysis-page">
        <header className="match-analysis-header-card">
          <div className="match-analysis-breadcrumb"><Link href="/screen">CV Screening</Link><ChevronRight size={14} /><Link href={jobId ? `/results?jobId=${encodeURIComponent(jobId)}` : "/results"}>Results</Link><ChevronRight size={14} /><strong>{candidate?.displayName ?? candidate?.name ?? "Candidate"}</strong></div>
          <div className="match-analysis-header">
            <div className="match-analysis-title"><span className="match-analysis-avatar">{candidate?.name?.slice(0, 1) ?? "C"}</span><div><div className="match-analysis-name-line"><h1>{candidate?.displayName ?? candidate?.name ?? "Candidate"}</h1><span>{candidate?.targetRole ?? "-"}</span></div><div className="candidate-identity-meta"><strong>Source CV:</strong> {candidate?.sourceFilename ?? candidate?.resume?.filename ?? "Not available"}</div><div className="match-analysis-subtitle"><span className="match-score-badge">{formatCandidateScore(candidate?.score)}</span><span><strong>Overall Score</strong></span><span className="match-recommendation-badge"><CheckCircle2 size={14} />{formatRecommendation(candidate?.recommendation ?? null)}</span><span><Clock3 size={14} />HR Decision: <strong>{formatPipelineStage(candidate?.pipelineStage)}</strong></span></div></div></div>
            <div className="match-analysis-actions"><div className="match-analysis-nav"><Link href={"/results" + (candidate?.jobId ? "?jobId=" + encodeURIComponent(candidate.jobId) : "")} aria-label="Back to results"><ArrowLeft size={15} /></Link></div><button className="button" type="button" onClick={() => setHrDecision("rejected", "Candidate marked as not selected for this role.")}><XCircle size={14} />Not selected</button><button className={"button primary " + (shortlisted ? "shortlisted" : "")} type="button" onClick={toggleShortlist}><Star size={14} />{shortlisted ? "Shortlisted" : "Add to shortlist"}</button></div>
          </div>
          <nav className="match-analysis-tabs" aria-label="Candidate detail views"><button className="active" type="button">Match Analysis</button><Link href={"/candidates/" + encodeURIComponent(candidateId) + "/profile" + (jobId ? "?jobId=" + encodeURIComponent(jobId) : "")}>Resume & Parsed Profile</Link></nav>
        </header>

        {loadError ? <div className="match-alternate-tab" role="alert"><XCircle size={24} /><div><h2>Candidate unavailable</h2><p>{loadError}</p></div></div> : null}
        {!loadError ? <div className="match-analysis-grid"><main className="match-analysis-main">
          <section className="match-analysis-card match-summary-card">
            <header className="match-analysis-card-header"><h2><Brain size={16} />AI Suitability Summary</h2><button className="match-rescore-button" type="button" onClick={rescore} disabled={rescoreState === "Scoring..."}><RefreshCw size={13} />{rescoreState}</button></header>
            <p>{candidate?.summary ?? "Candidate analysis is being loaded from the screening result."}</p>
            <div className="match-strength-gap-grid"><div><h3 className="strength-title"><CheckCircle2 size={16} />Key Strengths</h3><ul>{(candidate?.matchedSkills?.length ? candidate.matchedSkills : ["No directly grounded matched skills were recorded."]).map((skill) => <li key={skill}><Check size={13} /><span>{skill}</span></li>)}</ul></div><div><h3 className="gap-title"><AlertTriangle size={16} />Key Gaps</h3><ul>{(candidate?.missingSkills?.length ? candidate.missingSkills : ["No grounded skill gaps were recorded."]).map((skill) => <li key={skill}><XCircle size={13} /><span>{skill}</span></li>)}</ul></div></div>
          </section>
          <section className="match-analysis-card"><header className="match-analysis-card-header"><h2>Five-Pillar Score Breakdown</h2><Link href="/jobs/new/scoring-weights">View rubric <ArrowRight size={13} /></Link></header><div className="match-score-list">{candidate?.scoreBreakdown?.length ? candidate.scoreBreakdown.map((pillar) => <div className="match-score-row" key={pillar.pillarCode}><span>{pillar.pillarName}</span><div><i style={{ width: pillar.percentage + "%" }} /></div><strong>{pillar.earnedScore} / {pillar.maxScore}</strong></div>) : <p>No evidence-grounded score breakdown is available. Run Rescore to evaluate this CV with the active rubric.</p>}</div></section>
          <section className="match-analysis-card"><header className="match-analysis-card-header"><h2><ShieldCheck size={16} />Evidence Mapping</h2><Link href={"/candidates/" + encodeURIComponent(candidateId) + "/profile" + (jobId ? "?jobId=" + encodeURIComponent(jobId) : "")}>Open parsed profile <ArrowRight size={13} /></Link></header><div className="match-evidence-list">{evidenceRows(candidate).length ? evidenceRows(candidate).map((item, index) => <div className="match-evidence" key={item.code}><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{item.name}</h3><p>{item.evidence.length ? `Resume evidence: ${item.evidence.join("; ")}` : item.explanation}</p></div></div>) : <p>No directly quoted resume evidence is available yet.</p>}</div></section>
        </main><aside className="match-analysis-side">
          <section className="match-analysis-card match-review-card"><h2>HR Decision</h2><p>AI recommends <strong>{formatRecommendation(candidate?.recommendation ?? null)}</strong>. The final decision always belongs to the HR operator.</p><div className="match-decision-current"><span>Current decision</span><strong>{formatPipelineStage(candidate?.pipelineStage)}</strong></div><div className="match-decision-actions"><button className={"button primary " + (shortlisted ? "shortlisted" : "")} type="button" onClick={toggleShortlist}><Star size={14} />{shortlisted ? "Shortlisted" : "Shortlist"}</button><button className="button" type="button" onClick={() => setHrDecision("hr_review", "Candidate kept for HR review.")}>Keep for review</button><button className="button match-decision-reject" type="button" onClick={() => setHrDecision("rejected", "Candidate marked as not selected for this role.")}><XCircle size={14} />Not selected</button></div><p className="match-ai-note"><Brain size={13} />Evidence-grounded AI support, not an automated hiring decision.</p></section>
          <section className="match-analysis-card"><h2 className="match-side-title"><UserRound size={16} />Candidate Profile</h2><div className="match-profile-list"><div><span>Experience</span><strong>{candidate?.experienceYears !== null && candidate?.experienceYears !== undefined ? candidate.experienceYears + " years" : "-"}</strong></div><div><span>Location</span><strong>{candidate?.location ?? "-"}</strong></div><div><span>Education</span><strong>{candidate?.education?.[0] && typeof candidate.education[0].degree === "string" ? candidate.education[0].degree : "-"}</strong></div><div><span>Target role</span><strong>{candidate?.targetRole ?? "-"}</strong></div></div><Link className="match-analysis-link" href={"/candidates/" + encodeURIComponent(candidateId) + "/profile" + (jobId ? "?jobId=" + encodeURIComponent(jobId) : "")}>View full profile <ArrowRight size={13} /></Link></section>
          <section className="match-analysis-card"><h2 className="match-side-title"><History size={16} />Screening Provenance</h2><div className="match-activity"><div><time>Provider / Model</time><p>{[candidate?.screening?.providerName, candidate?.screening?.modelName].filter(Boolean).join(" / ") || "Pending live scoring"}</p></div><div><time>Privacy</time><p>{candidate?.screening?.privacyMode ?? "Not recorded"}</p></div><div><time>Source</time><p>{candidate?.sourceFilename ?? candidate?.resume?.filename ?? "Resume unavailable"}</p></div><div><time>Trace</time><p>{candidate?.screening?.traceId ?? "Not generated"}</p></div></div></section>
        </aside></div> : null}

        {notice ? <div className="match-analysis-toast" role="status"><CheckCircle2 size={16} />{notice}<button type="button" aria-label="Dismiss notice" onClick={() => setNotice("")}><X size={14} /></button></div> : null}
      </div>
    </AppShell>
  );
}

function formatRecommendation(value: string | null) {
  return value ? value.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ") : "Pending review";
}

function formatPipelineStage(value: string | undefined) {
  if (!value || value === "new") return "Pending HR review";
  if (value === "shortlisted") return "Shortlisted";
  if (value === "rejected") return "Not selected";
  if (value === "hr_review") return "Keep for review";
  return value.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function evidenceRows(candidate: ApiCandidate | null) {
  return (candidate?.scoreBreakdown ?? []).flatMap((pillar) => pillar.criteria.map((criterion) => ({
    code: criterion.criterionCode,
    name: criterion.criterionName,
    evidence: criterion.evidence,
    explanation: criterion.explanation ?? "No grounded explanation was returned."
  })));
}
