"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  Download,
  FileText,
  Mail,
  MapPin,
  Phone,
  Star,
  UserRound,
  X,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ApiError } from "@/lib/api-client";
import { addApplicationsToShortlist, downloadCandidateResume, fetchCandidate, moveApplicationStage, removeApplicationFromShortlist, type ApiCandidate } from "@/features/candidates/candidates-api";
import { formatCandidateScore } from "@/features/candidates/candidate-format";

export function CandidateResumeParsedProfile({ candidateId = "CAND-JAVA-001", jobId }: { candidateId?: string; jobId?: string }) {
  const [candidate, setCandidate] = useState<ApiCandidate | null>(null);
  const [loadError, setLoadError] = useState("");
  const [zoom, setZoom] = useState(100);
  const [showContact, setShowContact] = useState(false);
  const [shortlisted, setShortlisted] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    fetchCandidate(candidateId, jobId).then((value) => {
      if (!active) return;
      setCandidate(value);
      setShortlisted(value.pipelineStage === "shortlisted");
    }).catch((error: unknown) => { if (active) setLoadError(error instanceof ApiError ? error.message : "Unable to load candidate profile."); });
    return () => { active = false; };
  }, [candidateId, jobId]);

  async function downloadResume() {
    if (!candidate) return;
    try {
      const result = await downloadCandidateResume(candidateId, jobId);
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.filename ?? candidate.sourceFilename ?? "candidate-resume";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setNotice("Original CV download started.");
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : "Unable to download the original CV.");
    }
  }

  async function toggleShortlist() {
    if (!candidate?.applicationId) return;
    const nextValue = !shortlisted;
    try {
      if (nextValue) await addApplicationsToShortlist([candidate.applicationId]);
      else await removeApplicationFromShortlist(candidate.applicationId);
      setShortlisted(nextValue);
      setNotice(nextValue ? "Candidate added to shortlist." : "Candidate removed from shortlist.");
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : "Unable to update shortlist.");
    }
  }

  async function rejectCandidate() {
    if (!candidate?.applicationId) return;
    try {
      await moveApplicationStage(candidate.applicationId, "rejected");
      setCandidate((current) => current ? { ...current, pipelineStage: "rejected" } : current);
      setShortlisted(false);
      setNotice("Candidate marked as not selected for this role.");
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : "Unable to save the HR decision.");
    }
  }

  return (
    <AppShell activePath="/results" breadcrumb="CV Screening / Candidate Profile">
      <div className="resume-profile-page">
        <header className="resume-profile-header-card">
          <div className="resume-profile-breadcrumb"><Link href="/screen">CV Screening</Link><ChevronRight size={14} /><Link href={jobId ? `/results?jobId=${encodeURIComponent(jobId)}` : "/results"}>Results</Link><ChevronRight size={14} /><strong>{candidate?.displayName ?? candidate?.name ?? "Candidate"}</strong></div>
          <div className="resume-profile-header">
            <div className="resume-profile-title">
              <span className="resume-profile-avatar">C</span>
              <div>
                <div className="resume-profile-name-line"><h1>{candidate?.displayName ?? candidate?.name ?? "Candidate"}</h1><span className="resume-profile-new-badge">{candidate ? "PROFILE" : "LOADING"}</span></div>
                <div className="resume-profile-role">Evaluated for {candidate?.targetRole ?? "selected role"}</div>
                <div className="candidate-identity-meta"><strong>Source CV:</strong> {candidate?.sourceFilename ?? candidate?.resume?.filename ?? "Not available"}</div>
                <div className="resume-profile-subtitle"><span className="resume-profile-score">{formatCandidateScore(candidate?.score)}</span><span><strong>{formatRecommendation(candidate?.recommendation ?? null)}</strong></span><span>{candidate?.pipelineStage ?? "pending"}</span></div>
              </div>
            </div>
            <div className="resume-profile-actions">
              <div className="resume-profile-nav"><Link href={jobId ? `/results?jobId=${encodeURIComponent(jobId)}` : "/results"} aria-label="Back to results"><ArrowLeft size={15} /></Link></div>
              <button className="button" type="button" onClick={rejectCandidate}><X size={14} />Not selected</button>
              <button className={"button primary " + (shortlisted ? "shortlisted" : "")} type="button" onClick={toggleShortlist}><Star size={14} />{shortlisted ? "Shortlisted" : "Add to shortlist"}</button>
            </div>
          </div>
          <nav className="resume-profile-tabs" aria-label="Candidate detail views">
            <Link href={"/candidates/" + encodeURIComponent(candidateId) + "/match-analysis" + (jobId ? "?jobId=" + encodeURIComponent(jobId) : "")}>Match Analysis</Link>
            <button className="active" type="button">Resume & Parsed Profile</button>
          </nav>
        </header>

        {loadError ? <div className="resume-profile-alternate" role="alert"><AlertTriangle size={24} /><div><h2>Candidate unavailable</h2><p>{loadError}</p></div></div> : null}
        {!loadError ? <div className="resume-profile-layout">
          <section className="resume-viewer-card" aria-label="Protected candidate profile preview">
            <header className="resume-viewer-toolbar">
              <div className="resume-viewer-file"><FileText size={15} /><strong>{candidate?.sourceFilename ?? candidate?.resume?.filename ?? "Resume file"}</strong><span>Locally parsed document</span></div>
              <div className="resume-viewer-controls">
                <span>{candidate?.resume?.rawText ? "Extracted text (local)" : "Original CV stored locally"}</span>
                <span className="resume-control-divider" />
                <button type="button" aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(75, value - 10))}><ZoomOut size={14} /></button>
                <span className="resume-zoom-value">{zoom}%</span>
                <button type="button" aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(125, value + 10))}><ZoomIn size={14} /></button>
                <button type="button" aria-label="Download original CV" title="Download original CV" onClick={downloadResume} disabled={!candidate}><Download size={14} /></button>
              </div>
            </header>
            <div className="resume-viewer-stage">
              <article className="resume-document" style={{ transform: "scale(" + zoom / 100 + ")" }}>
                <header className="resume-document-header"><div><h2>{candidate?.name ?? candidateId}</h2><p>{candidate?.currentTitle ?? candidate?.targetRole ?? "Candidate"}</p></div><div className="resume-document-contact"><span>{candidate?.location ?? "Location not stated"}</span>{showContact && candidate?.email ? <span>{candidate.email}</span> : null}</div></header>
                <section className="resume-document-section"><h3>{candidate?.resume?.rawText ? "Extracted Resume Text" : "Privacy-Protected Processing"}</h3><pre className="resume-raw-text">{candidate?.resume?.rawText ?? "Text extraction completed successfully. The raw CV text was deleted after structured analysis; only grounded profile fields and scoring evidence were retained."}</pre></section>
              </article>
            </div>
            <footer className="resume-viewer-footer"><span><CheckCircle2 size={14} />Original file remains local; raw extracted text is not retained</span></footer>
          </section>

          <aside className="parsed-profile-panel" aria-label="Parsed candidate profile">
            <header className="parsed-panel-header"><div><span className="eyebrow">GROUNDED EXTRACTION</span><h2>Structured Data</h2></div></header>
            <div className="parsed-panel-meta"><span><CheckCircle2 size={14} />{candidate?.resume?.parserStatus ?? "Pending"}</span><span>Confidence {formatConfidence(candidate?.confidence ?? candidate?.resume?.parserConfidence ?? null)}</span></div>
            <section className="parsed-panel-card"><header><h3><UserRound size={15} />Personal Information</h3><button className="pii-toggle" type="button" onClick={() => setShowContact((value) => !value)}>{showContact ? "Mask" : "View"}</button></header><div className="parsed-panel-fields"><ParsedField label="Full Name" value={candidate?.name ?? "-"} /><ParsedField label="Email" value={showContact ? candidate?.email ?? "-" : "••••••••@email.com"} icon={<Mail size={13} />} /><ParsedField label="Phone" value={"Hidden"} icon={<Phone size={13} />} /><ParsedField label="Location" value={candidate?.location ?? "-"} icon={<MapPin size={13} />} /></div></section>
            <section className="parsed-panel-card"><header><h3><Check size={15} />Normalized Skills</h3><span className="parsed-count">{candidate?.skills?.length ?? 0} detected</span></header><div className="parsed-skill-list">{(candidate?.skills ?? []).map((skill) => <span className="parsed-skill-chip" key={skill}>{skill}</span>)}</div></section>
            <section className="parsed-panel-card"><header><h3><FileText size={15} />Work History</h3></header><div className="parsed-work-history">{candidate?.experiences?.length ? candidate.experiences.map((item, index) => <ParsedWorkEntry key={`${item.company}-${item.title}-${index}`} title={item.title} company={item.company} date={formatDateRange(item.startDate, item.endDate, item.isCurrent)} duration={item.location ?? ""} />) : <span>No grounded work history detected.</span>}</div></section>
            <section className="parsed-panel-card"><header><h3><CheckCircle2 size={15} />Education & Certifications</h3></header><div className="parsed-education-list">{candidate?.education?.map((item, index) => <div key={`${item.institution}-${index}`}><strong>{[item.degree, item.fieldOfStudy].filter(Boolean).join(" - ") || "Education"}</strong><span>{item.institution} · {[item.startYear, item.endYear].filter(Boolean).join(" - ") || "Dates not stated"}</span></div>)}{candidate?.certifications?.map((item, index) => <div key={`${item.name}-${index}`}><strong>{item.name}</strong><span>{item.issuer ?? "Issuer not stated"}</span></div>)}{!candidate?.education?.length && !candidate?.certifications?.length ? <span>No grounded education or certification records detected.</span> : null}</div></section>
            <section className="parsed-panel-card"><header><h3><Star size={15} />Projects</h3><span className="parsed-count">{candidate?.projects?.length ?? 0} detected</span></header><div className="parsed-project-list">{candidate?.projects?.length ? candidate.projects.map((item, index) => <div key={`${item.name}-${index}`}><strong>{item.name}</strong><span>{item.technologies.join(" · ") || item.description || "No additional details"}</span></div>) : <span>No grounded projects detected.</span>}</div></section>
            <div className="parsed-source-note"><FileText size={14} /><span>Fields are extracted from the original resume. Verify before making a final decision.</span></div>
          </aside>
        </div> : null}

        {notice ? <div className="resume-profile-toast" role="status"><CheckCircle2 size={16} />{notice}<button type="button" aria-label="Dismiss notice" onClick={() => setNotice("")}><X size={14} /></button></div> : null}
      </div>
    </AppShell>
  );
}

function ParsedField({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return <div className="parsed-field"><label>{label}</label><strong>{icon}{value}</strong></div>;
}

function ParsedWorkEntry({ title, company, date, duration }: { title: string; company: string; date: string; duration: string }) {
  return <div className="parsed-work-entry"><div className="parsed-work-dot" /><div><div className="parsed-work-heading"><strong>{title}</strong><span>{duration}</span></div><span className="parsed-work-company">{company}</span><span className="parsed-work-date">{date}</span></div></div>;
}

function formatRecommendation(value: string | null) {
  return value ? value.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ") : "Pending review";
}

function formatConfidence(value: number | null) {
  if (value === null) return "Pending";
  return `${Math.round(value <= 1 ? value * 100 : value)}%`;
}

function formatDateRange(start: string | null, end: string | null, isCurrent: boolean) {
  return `${start ?? "Start not stated"} - ${isCurrent ? "Present" : end ?? "End not stated"}`;
}
