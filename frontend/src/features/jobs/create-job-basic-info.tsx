"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Bold,
  Check,
  CircleAlert,
  FileCheck2,
  FileText,
  Italic,
  LayoutDashboard,
  Link2,
  List,
  Save,
  ShieldCheck,
  Upload,
  UserRound
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { defaultJobDraft, loadJobDraft, saveJobDraft, type JobDraft } from "@/features/jobs/job-draft";

const steps = [
  { label: "Basic information", href: "/jobs/new/basic-info" },
  { label: "Screening criteria", href: "/jobs/new/screening-criteria" },
  { label: "Scoring weights", href: "/jobs/new/scoring-weights" },
  { label: "Review & publish", href: "/jobs/new/review" }
];

export function CreateJobBasicInfo() {
  const router = useRouter();
  const [title, setTitle] = useState(defaultJobDraft.title);
  const [department, setDepartment] = useState(defaultJobDraft.department);
  const [employmentType, setEmploymentType] = useState(defaultJobDraft.employmentType);
  const [seniority, setSeniority] = useState(defaultJobDraft.seniority);
  const [arrangement, setArrangement] = useState(defaultJobDraft.workMode);
  const [location, setLocation] = useState(defaultJobDraft.location);
  const [openings, setOpenings] = useState("1");
  const [description, setDescription] = useState(defaultJobDraft.description);
  const [jdFile, setJdFile] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [saved, setSaved] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const draft = loadJobDraft();
    setTitle(draft.title);
    setDepartment(draft.department);
    setEmploymentType(draft.employmentType);
    setSeniority(draft.seniority);
    setArrangement(draft.workMode);
    setLocation(draft.location);
    setOpenings(draft.openings);
    setDescription(draft.description);
  }, []);

  const requiredFields = [title, department, employmentType, seniority, arrangement, location, description];
  const completedFields = requiredFields.filter(Boolean).length;
  const completion = Math.min(50, 15 + completedFields * 5);
  const descriptionTooShort = description.trim().length < 20;
  const titleTooShort = title.trim().length < 3;
  const departmentTooShort = department.trim().length < 2;
  const hasFormErrors = titleTooShort || departmentTooShort || !employmentType || !seniority || !arrangement || !location || descriptionTooShort;
  const descriptionCount = description.length;
  const statusText = saved ? "Draft saved" : "Draft";

  const summaryItems = useMemo(() => [
    { label: "Status", value: statusText, icon: FileText },
    { label: "Job Owner", value: "Jane Doe", icon: UserRound }
  ], [statusText]);

  function getDraft(): JobDraft {
    const existing = loadJobDraft();
    return {
      ...defaultJobDraft,
      ...existing,
      title,
      department,
      employmentType,
      seniority,
      workMode: arrangement,
      location,
      openings,
      description
    };
  }

  function handleContinue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    if (!hasFormErrors) {
      saveJobDraft(getDraft());
      router.push("/jobs/new/screening-criteria");
    }
  }

  function handleSaveDraft() {
    saveJobDraft(getDraft());
    setSaved(true);
  }

  function insertMarkdown(prefix: string, suffix = prefix) {
    const nextValue = description ? description + "\n" + prefix + "text" + suffix : prefix + "text" + suffix;
    setDescription(nextValue.slice(0, 5000));
  }

  return (
    <AppShell activePath="/jobs" breadcrumb="Recruitment / Create Job / Basic Information">
      <div className="create-job-page">
        <header className="create-job-header">
          <div>
            <nav className="create-job-breadcrumb" aria-label="Breadcrumb">
              <Link href="/jobs">Recruitment</Link><span>/</span><Link href="/jobs">Job Openings</Link><span>/</span><strong>Create job</strong>
            </nav>
            <h1 className="page-title">Create job opening</h1>
          </div>
          <button className="button save-draft-button" type="button" onClick={handleSaveDraft}><Save size={15} aria-hidden="true" />Save draft</button>
        </header>

        <nav className="job-stepper" aria-label="Job setup steps">
          {steps.map((step, index) => (
            <div className={"job-step " + (index === 0 ? "current" : "")} key={step.href}>
              <Link href={step.href} aria-current={index === 0 ? "step" : undefined}><span>{index + 1}</span><strong>{step.label}</strong></Link>
              {index < steps.length - 1 ? <i aria-hidden="true" /> : null}
            </div>
          ))}
        </nav>

        <form className="create-job-layout" id="create-job-form" onSubmit={handleContinue} noValidate>
          <div className="create-job-form-column">
            <section className="create-job-card">
              <h2>Job Details</h2>
              {submitted && hasFormErrors ? <p className="field-error" role="alert"><CircleAlert size={13} aria-hidden="true" />Complete all required fields before continuing.</p> : null}
              <div className="create-job-fields two-columns">
                <Field label="Job title" required error={submitted && titleTooShort} errorMessage="Enter at least 3 characters."><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Senior Frontend Engineer" /></Field>
                <Field label="Department" required error={submitted && departmentTooShort} errorMessage="Select a department."><select value={department} onChange={(event) => setDepartment(event.target.value)}><option value="">Select department</option><option>Engineering</option><option>Product</option><option>Design</option><option>Marketing</option></select></Field>
                <Field label="Employment type" required error={submitted && !employmentType}><select value={employmentType} onChange={(event) => setEmploymentType(event.target.value)}><option value="">Select type</option><option>Full-time</option><option>Part-time</option><option>Contract</option></select></Field>
                <Field label="Seniority level" required error={submitted && !seniority}><select value={seniority} onChange={(event) => setSeniority(event.target.value)}><option value="">Select level</option><option>Entry-level</option><option>Mid-level</option><option>Senior</option><option>Lead / Manager</option></select></Field>
                <Field label="Work arrangement" required error={submitted && !arrangement}><select value={arrangement} onChange={(event) => setArrangement(event.target.value)}><option value="">Select arrangement</option><option>Remote</option><option>Hybrid</option><option>On-site</option></select></Field>
                <Field label="Location" required error={submitted && !location}><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="e.g. San Francisco, CA or Remote" /></Field>
              </div>
              <div className="create-job-fields openings-grid">
                <Field label="Hiring manager" hint="Defaults to current user."><div className="readonly-field"><UserRound size={15} aria-hidden="true" /><input readOnly value="Jane Doe" /></div></Field>
                <Field label="Number of openings"><input min="1" type="number" value={openings} onChange={(event) => setOpenings(event.target.value)} /></Field>
              </div>
            </section>

            <section className="create-job-card">
              <div className="description-heading"><div><h2>Job Description</h2><p>Use clear responsibilities and requirements for better AI matching.</p></div><button className="import-jd-button" type="button" onClick={() => fileInput.current?.click()}><Upload size={15} aria-hidden="true" />Import JD file</button><input ref={fileInput} className="sr-only" type="file" accept=".pdf,.docx,.txt" onChange={(event) => setJdFile(event.target.files?.[0]?.name ?? "")} /></div>
              {jdFile ? <div className="file-selected"><Check size={14} aria-hidden="true" />{jdFile}</div> : null}
              <Field label="Description" required error={submitted && descriptionTooShort} errorMessage="Enter at least 20 characters.">
                <div className="editor-wrap">
                  <div className="editor-toolbar" aria-label="Description formatting tools">
                    <button type="button" onClick={() => insertMarkdown("**")} aria-label="Bold"><Bold size={15} /></button>
                    <button type="button" onClick={() => insertMarkdown("_")} aria-label="Italic"><Italic size={15} /></button>
                    <button type="button" onClick={() => insertMarkdown("- ")} aria-label="Bulleted list"><List size={15} /></button>
                    <span />
                    <button type="button" onClick={() => insertMarkdown("[", "](https://example.com)")} aria-label="Insert link"><Link2 size={15} /></button>
                  </div>
                  <textarea value={description} onChange={(event) => setDescription(event.target.value.slice(0, 5000))} placeholder="Enter full job description, responsibilities, and requirements here..." rows={12} />
                </div>
              </Field>
              <div className="description-footer"><span>Supports markdown formatting.</span><strong>{descriptionCount}/5000</strong></div>
            </section>
          </div>

          <aside className="create-job-sidebar">
            <section className="setup-progress-card">
              <h2>Setup Progress</h2>
              <div className="setup-progress-label"><span>Step Completion</span><strong>{completion}%</strong></div>
              <div className="setup-progress-track"><span style={{ width: completion + "%" }} /></div>
              <div className="setup-summary">
                {summaryItems.map((item) => { const Icon = item.icon; return <div key={item.label}><span><Icon size={15} aria-hidden="true" /></span><p><small>{item.label}</small><strong>{item.value}</strong></p></div>; })}
              </div>
            </section>
            <section className="privacy-reminder"><ShieldCheck size={17} aria-hidden="true" /><div><h3>Data Privacy Reminder</h3><p>Ensure job descriptions comply with internal hiring policies and do not request sensitive PII in open text fields. Automated AI screening will use criteria defined in the next steps.</p></div></section>
          </aside>
        </form>

        <footer className="create-job-actions">
          <Link className="cancel-action" href="/jobs">Cancel</Link>
          <div><button className="button save-draft-button footer-save" type="button" onClick={handleSaveDraft}><Save size={15} aria-hidden="true" />Save draft</button><button className="button primary continue-button" type="submit" form="create-job-form"><span>Continue to criteria</span><ArrowRight size={15} aria-hidden="true" /></button></div>
        </footer>
      </div>
    </AppShell>
  );
}

function Field({ label, required, error, errorMessage, hint, children }: { label: string; required?: boolean; error?: boolean; errorMessage?: string; hint?: string; children: React.ReactNode }) {
  return <label className="create-job-field"><span>{label}{required ? <em> *</em> : null}</span>{children}{hint ? <small>{hint}</small> : null}{error ? <small className="field-error"><CircleAlert size={13} aria-hidden="true" />{errorMessage ?? "Required field"}</small> : null}</label>;
}
