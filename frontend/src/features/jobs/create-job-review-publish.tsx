"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  Info,
  Pencil,
  ShieldCheck,
  Upload,
  X
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ApiError } from "@/lib/api-client";
import { clearJobDraft, defaultJobDraft, loadJobDraft, saveJobDraft, type JobDraft } from "@/features/jobs/job-draft";
import { createJob, publishJob } from "@/features/jobs/jobs-api";

const steps = [
  { label: "Basic information", href: "/jobs/new/basic-info" },
  { label: "Screening criteria", href: "/jobs/new/screening-criteria" },
  { label: "Scoring weights", href: "/jobs/new/scoring-weights" },
  { label: "Review & publish", href: "/jobs/new/review" }
];

export function CreateJobReviewPublish() {
  const [draft, setDraft] = useState<JobDraft>(defaultJobDraft);
  const [modalOpen, setModalOpen] = useState(false);
  const [published, setPublished] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setDraft(loadJobDraft());
  }, []);

  async function confirmPublish() {
    if (!acknowledged) return;
    if (!draft.title.trim() || !draft.department.trim() || draft.description.trim().length < 20) {
      setError("Basic Information needs a title, department, and a job description of at least 20 characters.");
      return;
    }
    setPublishing(true);
    setError("");
    try {
      const created = draft.createdJobId ? { id: draft.createdJobId } : await createJob(draft);
      const jobId = created.id;
      const nextDraft = { ...draft, createdJobId: jobId };
      setDraft(nextDraft);
      saveJobDraft(nextDraft);
      await publishJob(jobId);
      setPublished(true);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to publish this job.");
    } finally {
      setPublishing(false);
    }
  }

  function openPublishModal() {
    setPublished(false);
    setAcknowledged(false);
    setModalOpen(true);
  }

  function saveDraftLocally() {
    saveJobDraft(draft);
    setSaved(true);
  }

  const basicInfoReady = draft.title.trim().length >= 3 && draft.department.trim().length >= 2 && draft.description.trim().length >= 20;
  const criteriaReady = draft.mustHaveSkills.length > 0;
  const weightsTotal = Object.values(draft.scoringWeights).reduce((total, value) => total + value, 0);
  const weightsReady = weightsTotal === 100;

  const weights = [
    { label: "Technical Skills", value: draft.scoringWeights.technicalSkills, color: "blue" },
    { label: "Experience Level", value: draft.scoringWeights.experience, color: "teal" },
    { label: "Projects", value: draft.scoringWeights.projects, color: "sky" },
    { label: "Systems & Cloud", value: draft.scoringWeights.systemsCloud, color: "orange" },
    { label: "Education & Certifications", value: draft.scoringWeights.educationCertifications, color: "slate" }
  ];

  return (
    <AppShell activePath="/jobs" breadcrumb="Recruitment / Create Job / Review">
      <div className="review-page">
        <header className="review-header">
          <div>
            <h1 className="page-title">Review &amp; Publish</h1>
            <p className="page-subtitle">Review all job details before making it active for screening.</p>
          </div>
        </header>

        <nav className="criteria-stepper review-stepper" aria-label="Job setup steps">
          {steps.map((step, index) => (
            <div className={"criteria-step " + (index < 3 ? "complete" : "current")} key={step.href}>
              <Link href={step.href} aria-current={index === 3 ? "step" : undefined}><span>{index < 3 ? <Check size={15} aria-hidden="true" /> : index + 1}</span><strong>{index + 1}. {step.label}</strong></Link>
              {index < steps.length - 1 ? <i aria-hidden="true" /> : null}
            </div>
          ))}
        </nav>

        <div className="review-layout">
          <main className="review-main">
            <section className="review-card">
              <header className="review-card-header"><h2>Basic Information</h2><Link href="/jobs/new/basic-info"><Pencil size={14} aria-hidden="true" />Edit</Link></header>
              <dl className="review-details-grid">
                <div><dt>Job Title</dt><dd>{draft.title || "Not provided"}</dd></div>
                <div><dt>Department</dt><dd>{draft.department || "Not provided"}</dd></div>
                <div><dt>Location</dt><dd>{draft.location || "Not provided"}</dd></div>
                <div><dt>Employment Type</dt><dd>{draft.employmentType || "Not provided"}</dd></div>
              </dl>
            </section>

            <section className="review-card">
              <header className="review-card-header"><h2>Scoring &amp; Criteria</h2><Link href="/jobs/new/screening-criteria"><Pencil size={14} aria-hidden="true" />Edit</Link></header>
              <div className="review-card-content">
                <div className="review-subsection"><h3>Must-have Skills</h3><div className="review-skill-chips">{draft.mustHaveSkills.map((skill) => <span key={skill}>{skill}</span>)}</div></div>
                <div className="review-subsection"><h3>Scoring Weights</h3><div className="review-weight-list">{weights.map((weight) => <div key={weight.label}><span>{weight.label}</span><div className="review-weight-track"><i className={weight.color} style={{ width: weight.value + "%" }} /></div><strong>{weight.value}%</strong></div>)}</div></div>
              </div>
            </section>
          </main>

          <aside className="review-sidebar">
            <section className="review-card readiness-card">
              <header className="review-card-header"><h2><ClipboardCheck size={15} aria-hidden="true" />Readiness Checklist</h2></header>
              <ul className="readiness-list">
                <li className={basicInfoReady ? "" : "warning"}>{basicInfoReady ? <CheckCircle2 size={16} aria-hidden="true" /> : <CircleAlert size={16} aria-hidden="true" />}<span>Basic info complete</span></li>
                <li className={criteriaReady ? "" : "warning"}>{criteriaReady ? <CheckCircle2 size={16} aria-hidden="true" /> : <CircleAlert size={16} aria-hidden="true" />}<span>Criteria defined</span></li>
                <li className={weightsReady ? "" : "warning"}>{weightsReady ? <CheckCircle2 size={16} aria-hidden="true" /> : <CircleAlert size={16} aria-hidden="true" />}<span>Weights total 100%</span></li>
                <li className="warning"><CircleAlert size={16} aria-hidden="true" /><span><strong>No PII reveal enabled</strong><small>Consider enabling PII masking for unbiased screening.</small></span></li>
              </ul>
              <div className={basicInfoReady && criteriaReady && weightsReady ? "ready-message" : "ready-message warning"}><Info size={15} aria-hidden="true" /><div><strong>{basicInfoReady && criteriaReady && weightsReady ? "Ready to Publish" : "Complete the highlighted setup steps"}</strong><p>{basicInfoReady && criteriaReady && weightsReady ? "This job configuration meets all minimum requirements for AI batch screening." : "Return to the incomplete setup step before publishing this job."}</p></div></div>
            </section>
            <Link className="review-settings-link" href="/settings/ai-taxonomy"><ShieldCheck size={15} aria-hidden="true" />Review screening privacy settings</Link>
          </aside>
        </div>

        <footer className="criteria-actions review-actions">
          <Link className="button" href="/jobs/new/scoring-weights"><ArrowLeft size={15} aria-hidden="true" />Back</Link>
          <div><button className="button save-draft-button" type="button" onClick={saveDraftLocally}>{saved ? "Draft saved" : "Save as draft"}</button><button className="button primary publish-button" type="button" onClick={openPublishModal}><Upload size={15} aria-hidden="true" />Publish Job<ArrowRight size={15} aria-hidden="true" /></button></div>
        </footer>
      </div>

      {modalOpen ? <div className="publish-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalOpen(false); }}>
        <section className="publish-modal" role="dialog" aria-modal="true" aria-labelledby="publish-title">
          <header><h2 id="publish-title">{published ? "Job Published Successfully" : "Publish Job"}</h2><button type="button" onClick={() => setModalOpen(false)} aria-label="Close publish dialog"><X size={18} /></button></header>
          {published ? <div className="publish-success"><span><CheckCircle2 size={30} aria-hidden="true" /></span><h3>Job Published Successfully</h3><p>Job ID: <strong>{draft.createdJobId}</strong></p></div> : <div className="publish-confirm"><p>Publishing this job will make it available for CV batch screening. You can still edit criteria later, but it may require rescoring existing candidates.</p><label><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />I confirm that the job configuration is ready for publishing.</label>{error ? <span className="field-error"><CircleAlert size={14} aria-hidden="true" />{error}</span> : null}</div>}
          {published ? <div className="publish-success-actions"><Link className="button primary" href={`/batches/upload?jobId=${draft.createdJobId}`}><Upload size={15} aria-hidden="true" />Upload CVs now</Link><div><Link className="button" href={`/jobs/${draft.createdJobId}`}>View job</Link><Link className="button" href="/jobs" onClick={clearJobDraft}>Return to list</Link></div></div> : <footer><button className="button" type="button" onClick={() => setModalOpen(false)}>Cancel</button><button className="button primary" type="button" disabled={!acknowledged || publishing} onClick={confirmPublish}>{publishing ? "Publishing..." : "Confirm and Publish"}</button></footer>}
        </section>
      </div> : null}
    </AppShell>
  );
}
