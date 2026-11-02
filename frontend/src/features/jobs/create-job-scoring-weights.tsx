"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  RotateCcw,
  ShieldAlert,
  ToggleRight
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { loadJobDraft, saveJobDraft } from "@/features/jobs/job-draft";

type PillarId = "technical" | "experience" | "projects" | "systems" | "education";

type Pillar = {
  id: PillarId;
  label: string;
  subcriteria: string[];
};

const pillars: Pillar[] = [
  { id: "technical", label: "Technical Skills", subcriteria: ["Languages", "Frameworks", "Tools"] },
  { id: "experience", label: "Experience", subcriteria: ["Years in role", "Relevant industry experience"] },
  { id: "projects", label: "Projects", subcriteria: ["Project complexity", "Delivery ownership"] },
  { id: "systems", label: "Systems & Cloud", subcriteria: ["Architecture", "Cloud platforms", "Reliability"] },
  { id: "education", label: "Education & Certifications", subcriteria: ["Degree relevance", "Required certifications"] }
];

const standardWeights: Record<PillarId, number> = {
  technical: 40,
  experience: 25,
  projects: 15,
  systems: 10,
  education: 10
};

const sampleScores: Record<PillarId, number> = {
  technical: 92,
  experience: 84,
  projects: 78,
  systems: 70,
  education: 100
};

const steps = [
  { label: "Basic info", href: "/jobs/new/basic-info" },
  { label: "Screening criteria", href: "/jobs/new/screening-criteria" },
  { label: "Scoring weights", href: "/jobs/new/scoring-weights" },
  { label: "Review & publish", href: "/jobs/new/review" }
];

export function CreateJobScoringWeights() {
  const [weights, setWeights] = useState(standardWeights);
  const [expanded, setExpanded] = useState<Record<PillarId, boolean>>({
    technical: true,
    experience: false,
    projects: false,
    systems: false,
    education: false
  });
  const [disqualifiers, setDisqualifiers] = useState({
    missingSkills: true,
    insufficientExperience: false,
    missingCertification: false
  });
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    const draft = loadJobDraft();
    setWeights({
      technical: draft.scoringWeights.technicalSkills,
      experience: draft.scoringWeights.experience,
      projects: draft.scoringWeights.projects,
      systems: draft.scoringWeights.systemsCloud,
      education: draft.scoringWeights.educationCertifications
    });
    setDisqualifiers(draft.disqualifiers);
  }, []);
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
  const validTotal = total === 100;
  const previewScore = Math.round(pillars.reduce((sum, pillar) => sum + sampleScores[pillar.id] * weights[pillar.id], 0) / 100);

  const totalMessage = useMemo(() => {
    if (validTotal) return "Weights are balanced and ready for review.";
    return total < 100 ? "Add " + (100 - total) + "% to reach a complete rubric." : "Remove " + (total - 100) + "% to keep the rubric at 100%.";
  }, [total, validTotal]);

  function updateWeight(id: PillarId, value: string) {
    const parsed = Number(value);
    setWeights((current) => ({ ...current, [id]: Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : 0 }));
    setSaved(false);
  }

  function resetWeights() {
    setWeights(standardWeights);
    setSaved(false);
  }

  function toggleDisqualifier(key: keyof typeof disqualifiers) {
    setDisqualifiers((current) => ({ ...current, [key]: !current[key] }));
    setSaved(false);
  }

  function saveWeights() {
    const draft = loadJobDraft();
    saveJobDraft({
      ...draft,
      scoringWeights: {
        technicalSkills: weights.technical,
        experience: weights.experience,
        projects: weights.projects,
        systemsCloud: weights.systems,
        educationCertifications: weights.education
      },
      disqualifiers
    });
    setSaved(true);
  }

  return (
    <AppShell activePath="/jobs" breadcrumb="Recruitment / Create Job / Scoring Weights">
      <div className="weights-page">
        <header className="weights-header">
          <nav className="create-job-breadcrumb" aria-label="Breadcrumb">
            <Link href="/jobs">Recruitment</Link><span>/</span><Link href="/jobs">Job Openings</Link><span>/</span><strong>Create job</strong>
          </nav>
          <div className="weights-title-row"><h1 className="page-title">Scoring Weights</h1><button className="button" type="button" onClick={resetWeights}><RotateCcw size={15} aria-hidden="true" />Reset to standard rubric</button></div>
        </header>

        <nav className="criteria-stepper" aria-label="Job setup steps">
          {steps.map((step, index) => (
            <div className={"criteria-step " + (index < 2 ? "complete" : index === 2 ? "current" : "")} key={step.href}>
              <Link href={step.href} aria-current={index === 2 ? "step" : undefined}><span>{index < 2 ? <Check size={15} aria-hidden="true" /> : index + 1}</span><strong>{step.label}</strong></Link>
              {index < steps.length - 1 ? <i aria-hidden="true" /> : null}
            </div>
          ))}
        </nav>

        <div className="weights-layout">
          <main className="weights-main">
            <section className={"weights-card " + (validTotal ? "valid" : "invalid")} id="weights-total">
              <header className="weights-card-header"><h2>Evaluation Pillars</h2><span className="total-indicator">{validTotal ? <CheckCircle2 size={15} aria-hidden="true" /> : <CircleAlert size={15} aria-hidden="true" />}Total: {total}%</span></header>
              <div className="weights-card-body">
                {pillars.map((pillar, index) => (
                  <div className="pillar" key={pillar.id}>
                    <div className="pillar-row">
                      <button className="pillar-toggle" type="button" onClick={() => setExpanded((current) => ({ ...current, [pillar.id]: !current[pillar.id] }))} aria-expanded={expanded[pillar.id]} aria-label={(expanded[pillar.id] ? "Collapse " : "Expand ") + pillar.label}>
                        {expanded[pillar.id] ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
                      </button>
                      <strong>{pillar.label}</strong>
                      <div className="weight-editor">
                        <label className="weight-slider"><span className="sr-only">{pillar.label} weight slider</span><input type="range" min="0" max="100" value={weights[pillar.id]} onChange={(event) => updateWeight(pillar.id, event.target.value)} /></label>
                        <label className="weight-number"><span className="sr-only">{pillar.label} weight percentage</span><input type="number" min="0" max="100" value={weights[pillar.id]} onChange={(event) => updateWeight(pillar.id, event.target.value)} /><span>%</span></label>
                      </div>
                    </div>
                    {expanded[pillar.id] ? <div className="subcriteria-list">{pillar.subcriteria.map((criterion, criterionIndex) => <div key={criterion}><span>{criterion}</span><em>{Math.max(5, Math.round(weights[pillar.id] / pillar.subcriteria.length) - criterionIndex)} pts</em></div>)}</div> : null}
                    {index < pillars.length - 1 ? <hr /> : null}
                  </div>
                ))}
              </div>
              <div className={"total-validation " + (validTotal ? "success" : "error")}><span>{validTotal ? <CheckCircle2 size={15} aria-hidden="true" /> : <CircleAlert size={15} aria-hidden="true" />}</span><strong>{validTotal ? "Valid rubric total" : "Invalid rubric total"}</strong><p>{totalMessage}</p></div>
            </section>

            <section className="weights-card thresholds-card">
              <header className="weights-card-header"><div><h2>Recommendation Thresholds</h2><p>Labels shown to reviewers based on the final candidate score.</p></div></header>
              <div className="threshold-table">
                <div><span className="threshold-dot strong" /><strong>Strong Recommend</strong><span>85 - 100</span></div>
                <div><span className="threshold-dot recommend" /><strong>Recommend</strong><span>70 - 84</span></div>
                <div><span className="threshold-dot review" /><strong>Review Needed</strong><span>50 - 69</span></div>
                <div><span className="threshold-dot reject" /><strong>Reject</strong><span>0 - 49</span></div>
              </div>
            </section>

            <section className="weights-card">
              <header className="weights-card-header"><div><h2>Minimum Disqualifiers</h2><p>Automatically exclude candidates when a mandatory condition is missing.</p></div><ShieldAlert size={17} className="muted-icon" aria-label="Disqualifier rules" /></header>
              <div className="disqualifier-list">
                <Disqualifier label="Missing must-have skills" description="Candidate must meet every required skill." enabled={disqualifiers.missingSkills} onToggle={() => toggleDisqualifier("missingSkills")} />
                <Disqualifier label="Insufficient experience" description="Candidate must meet the minimum experience rule." enabled={disqualifiers.insufficientExperience} onToggle={() => toggleDisqualifier("insufficientExperience")} />
                <Disqualifier label="Mandatory certification" description="Candidate must provide the required certification." enabled={disqualifiers.missingCertification} onToggle={() => toggleDisqualifier("missingCertification")} />
              </div>
            </section>
          </main>

          <aside className="weights-sidebar">
            <section className="weights-card score-preview-card">
              <header className="weights-card-header"><div><h2>Score Preview</h2><p>Sample candidate using this rubric.</p></div></header>
              <div className="score-preview">
                <div className="preview-score"><strong>{previewScore}</strong><span>/ 100</span></div>
                <span className={"preview-label " + (previewScore >= 85 ? "strong" : previewScore >= 70 ? "recommend" : "review")}>{previewScore >= 85 ? "Strong Recommend" : previewScore >= 70 ? "Recommend" : "Review Needed"}</span>
                <div className="preview-candidate"><span className="candidate-avatar">JD</span><div><strong>Jordan Davis</strong><small>Senior Backend Engineer</small></div></div>
                <div className="preview-breakdown">{pillars.map((pillar) => <div key={pillar.id}><span>{pillar.label}</span><strong>{Math.round(sampleScores[pillar.id] * weights[pillar.id] / 100)} pts</strong></div>)}</div>
              </div>
            </section>
            <section className="weights-card weights-note"><ToggleRight size={17} aria-hidden="true" /><p>Changes are saved to this draft rubric and applied to new screening batches after publishing.</p></section>
          </aside>
        </div>

        <footer className="criteria-actions">
          <Link className="button" href="/jobs/new/screening-criteria"><ArrowLeft size={15} aria-hidden="true" />Back</Link>
          <div><button className="button save-draft-button" type="button" onClick={saveWeights}>{saved ? "Draft saved" : "Save draft"}</button><Link className={"button primary " + (!validTotal ? "disabled-link" : "")} href={validTotal ? "/jobs/new/review" : "#weights-total"} onClick={(event) => { if (!validTotal) { event.preventDefault(); return; } saveWeights(); }}>{validTotal ? <>Continue to review<ArrowRight size={15} aria-hidden="true" /></> : "Fix total to continue"}</Link></div>
        </footer>
      </div>
    </AppShell>
  );
}

function Disqualifier({ label, description, enabled, onToggle }: { label: string; description: string; enabled: boolean; onToggle: () => void }) {
  return <div className="disqualifier-row"><div><strong>{label}</strong><p>{description}</p></div><button className={"switch " + (enabled ? "on" : "")} type="button" role="switch" aria-checked={enabled} aria-label={label} onClick={onToggle}><i /></button></div>;
}
