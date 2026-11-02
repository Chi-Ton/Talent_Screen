"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CircleHelp,
  GripVertical,
  Link2,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
  WandSparkles,
  X
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { loadJobDraft, saveJobDraft } from "@/features/jobs/job-draft";

type SkillLevel = "Intermediate" | "Advanced" | "Expert";

type Skill = {
  id: number;
  name: string;
  level: SkillLevel;
  years: number;
  synonym?: string;
};

const steps = [
  { label: "Basic information", href: "/jobs/new/basic-info" },
  { label: "Screening criteria", href: "/jobs/new/screening-criteria" },
  { label: "Scoring weights", href: "/jobs/new/scoring-weights" },
  { label: "Review & publish", href: "/jobs/new/review" }
];

const skillSuggestions = ["Kubernetes", "React", "TypeScript", "AWS", "Docker", "Kafka", "Redis", "JUnit", "Microservices"];

export function CreateJobScreeningCriteria() {
  const [mustHave, setMustHave] = useState<Skill[]>([
    { id: 1, name: "Java", level: "Expert", years: 5 },
    { id: 2, name: "Spring Boot", level: "Advanced", years: 4, synonym: "Spring Framework" },
    { id: 3, name: "PostgreSQL", level: "Intermediate", years: 3 },
    { id: 4, name: "Hibernate", level: "Advanced", years: 3 },
    { id: 5, name: "REST API", level: "Expert", years: 0 },
    { id: 6, name: "Microservices", level: "Advanced", years: 2 },
    { id: 7, name: "Maven", level: "Intermediate", years: 0 }
  ]);
  const [niceToHave, setNiceToHave] = useState(["Kafka", "Docker", "Redis", "AWS", "JUnit"]);
  const [skillSearch, setSkillSearch] = useState("");
  const [newNiceSkill, setNewNiceSkill] = useState("");
  const [minimumYears, setMinimumYears] = useState(2);
  const [strictExperience, setStrictExperience] = useState(true);
  const [degree, setDegree] = useState("Bachelor's Degree");
  const [fields, setFields] = useState(["Computer Science", "Information Tech"]);
  const [newField, setNewField] = useState("");
  const [extracted, setExtracted] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const draft = loadJobDraft();
    setMustHave(draft.mustHaveSkills.map((name, index) => ({ id: index + 1, name, level: "Intermediate", years: 0 })));
    setNiceToHave(draft.niceToHaveSkills);
    setMinimumYears(draft.minimumExperienceYears);
    setStrictExperience(draft.strictExperience);
    setDegree(draft.degree);
    setFields(draft.fieldsOfStudy);
  }, []);

  const suggestions = useMemo(() => skillSuggestions.filter((skill) => skill.toLowerCase().includes(skillSearch.toLowerCase()) && !mustHave.some((item) => item.name.toLowerCase() === skill.toLowerCase())), [mustHave, skillSearch]);
  const completion = extracted ? 45 : 35;

  function addMustHave(name: string) {
    const cleanName = name.trim();
    if (!cleanName) return;
    setMustHave((current) => {
      if (current.some((skill) => skill.name.toLowerCase() === cleanName.toLowerCase())) return current;
      const nextId = current.reduce((highestId, skill) => Math.max(highestId, skill.id), 0) + 1;
      return [...current, { id: nextId, name: cleanName, level: "Intermediate", years: 0 }];
    });
    setNiceToHave((current) => current.filter((skill) => skill.toLowerCase() !== cleanName.toLowerCase()));
    setSkillSearch("");
  }

  function addFromSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    addMustHave(skillSearch);
  }

  function updateSkill(id: number, changes: Partial<Skill>) {
    setMustHave((current) => current.map((skill) => skill.id === id ? { ...skill, ...changes } : skill));
  }

  function addNiceToHave() {
    const cleanName = newNiceSkill.trim();
    if (!cleanName || mustHave.some((skill) => skill.name.toLowerCase() === cleanName.toLowerCase()) || niceToHave.some((skill) => skill.toLowerCase() === cleanName.toLowerCase())) return;
    setNiceToHave((current) => [...current, cleanName]);
    setNewNiceSkill("");
  }

  function handleExtractRules() {
    setExtracted(true);
    ["TypeScript", "Docker"].forEach(addMustHave);
  }

  function addField() {
    const cleanField = newField.trim();
    if (!cleanField || fields.includes(cleanField)) return;
    setFields((current) => [...current, cleanField]);
    setNewField("");
  }

  function saveCriteria() {
    const draft = loadJobDraft();
    saveJobDraft({
      ...draft,
      mustHaveSkills: mustHave.map((skill) => skill.name),
      niceToHaveSkills: niceToHave,
      minimumExperienceYears: minimumYears,
      strictExperience,
      degree,
      fieldsOfStudy: fields
    });
    setSaved(true);
  }

  return (
    <AppShell activePath="/jobs" breadcrumb="Recruitment / Create Job / Screening Criteria">
      <div className="criteria-page">
        <header className="criteria-header">
          <nav className="create-job-breadcrumb" aria-label="Breadcrumb">
            <Link href="/jobs">Recruitment</Link><span>/</span><Link href="/jobs">Job Openings</Link><span>/</span><strong>Create job</strong>
          </nav>
          <h1 className="page-title">Create Job</h1>
        </header>

        <nav className="criteria-stepper" aria-label="Job setup steps">
          {steps.map((step, index) => (
            <div className={"criteria-step " + (index === 0 ? "complete" : index === 1 ? "current" : "")} key={step.href}>
              <Link href={step.href} aria-current={index === 1 ? "step" : undefined}><span>{index === 0 ? <Check size={15} aria-hidden="true" /> : index + 1}</span><strong>{index + 1}. {step.label}</strong></Link>
              {index < steps.length - 1 ? <i aria-hidden="true" /> : null}
            </div>
          ))}
        </nav>

        <section className="criteria-warning" role="alert">
          <AlertTriangle size={18} aria-hidden="true" />
          <div><h2>Criteria Restriction Warning</h2><p>Based on historical data for Senior Backend Engineer roles, setting more than 5 must-have skills with &gt;5 years experience reduces candidate pool by 82%. Consider moving some to &quot;Nice-to-have&quot;.</p></div>
        </section>

        <div className="criteria-layout">
          <div className="criteria-main-column">
            <section className="extract-rules-panel">
              <div><h2><WandSparkles size={18} aria-hidden="true" />Auto-generate criteria from Job Description</h2><p>We detected a JD uploaded in Step 1. Click to extract core skills and requirements instantly.</p></div>
              <button className="button primary" type="button" onClick={handleExtractRules}>{extracted ? "Rules extracted" : "Extract Rules"}</button>
            </section>

            <section className="criteria-card">
              <header className="criteria-card-header"><div><h2>1. Must-have technical skills</h2><p>Non-negotiable requirements for this role.</p></div><span>{mustHave.length} Added</span></header>
              <div className="criteria-card-body">
                <form className="skill-search-form" onSubmit={addFromSearch}>
                  <Search size={17} aria-hidden="true" />
                  <input value={skillSearch} onChange={(event) => setSkillSearch(event.target.value)} placeholder="Search and add skills (e.g., Kubernetes, React)..." aria-label="Search and add skills" />
                  {skillSearch && suggestions.length > 0 ? <div className="skill-suggestions">{suggestions.map((skill) => <button type="button" key={skill} onClick={() => addMustHave(skill)}><Plus size={14} aria-hidden="true" />{skill}</button>)}</div> : null}
                </form>
                <div className="skill-list">
                  {mustHave.map((skill) => <div className="skill-row" key={skill.id}>
                    <GripVertical size={17} className="drag-icon" aria-hidden="true" />
                    <strong>{skill.name}</strong>
                    {skill.synonym ? <span className="synonym"><Link2 size={12} aria-hidden="true" />{skill.synonym}</span> : null}
                    <div className="skill-controls">
                      <label><span className="sr-only">{skill.name} level</span><select value={skill.level} onChange={(event) => updateSkill(skill.id, { level: event.target.value as SkillLevel })}><option>Intermediate</option><option>Advanced</option><option>Expert</option></select></label>
                      <label className="years-control"><span className="sr-only">{skill.name} minimum years</span><input type="number" min="0" value={skill.years} onChange={(event) => updateSkill(skill.id, { years: Math.max(0, Number(event.target.value)) })} /> yrs+</label>
                      <button type="button" onClick={() => setMustHave((current) => current.filter((item) => item.id !== skill.id))} aria-label={"Remove " + skill.name}><Trash2 size={16} /></button>
                    </div>
                  </div>)}
                </div>
              </div>
            </section>

            <section className="criteria-card">
              <header className="criteria-card-header"><div><h2>2. Nice-to-have skills</h2><p>Used for scoring bonuses, not strict exclusion.</p></div></header>
              <div className="criteria-card-body">
                <div className="skill-chips">
                  {niceToHave.map((skill) => <span key={skill}>{skill}<button type="button" onClick={() => setNiceToHave((current) => current.filter((item) => item !== skill))} aria-label={"Remove " + skill}><X size={14} /></button></span>)}
                  <form className="add-chip-form" onSubmit={(event) => { event.preventDefault(); addNiceToHave(); }}><input value={newNiceSkill} onChange={(event) => setNewNiceSkill(event.target.value)} placeholder="Add skill..." aria-label="Add nice-to-have skill" /><button type="submit"><Plus size={15} aria-hidden="true" />Add skill</button></form>
                </div>
              </div>
            </section>

            <div className="criteria-two-column">
              <section className="criteria-card compact-criteria-card">
                <h2>3. Total Experience</h2>
                <div className="experience-fields">
                  <label><span>Minimum Years</span><input type="number" min="0" value={minimumYears} onChange={(event) => setMinimumYears(Math.max(0, Number(event.target.value)))} /></label>
                  <label><span>Strict Enforce</span><button className={"toggle " + (strictExperience ? "on" : "")} type="button" role="switch" aria-checked={strictExperience} onClick={() => setStrictExperience((current) => !current)}><i /></button></label>
                </div>
              </section>
              <section className="criteria-card compact-criteria-card">
                <h2>4. Education Requirements</h2>
                <label className="education-field"><span>Minimum Degree Level</span><select value={degree} onChange={(event) => setDegree(event.target.value)}><option>Bachelor&apos;s Degree</option><option>Master&apos;s Degree</option><option>No requirement</option></select></label>
                <label className="education-field"><span>Accepted Fields of Study</span><div className="field-chips">{fields.map((field) => <span key={field}>{field}<button type="button" onClick={() => setFields((current) => current.filter((item) => item !== field))} aria-label={"Remove " + field}><X size={12} /></button></span>)}<input value={newField} onChange={(event) => setNewField(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addField(); } }} onBlur={addField} placeholder="Add field..." /></div></label>
                </section>
            </div>
          </div>

          <aside className="criteria-sidebar">
            <section className="criteria-summary-card">
              <h2>Setup Progress</h2>
              <div className="criteria-progress-row"><div className="criteria-progress-ring" style={{ "--progress": completion * 3.6 + "deg" } as React.CSSProperties}><strong>{completion}%</strong></div><div><strong>Step 2 of 4</strong><p>Almost halfway there. Setting strong criteria improves AI match rate.</p></div></div>
            </section>
            <section className="criteria-summary-card">
              <h2>Draft Summary</h2>
              <dl><div><dt>Role</dt><dd>{loadJobDraft().title || "New job opening"}</dd></div><div><dt>Department</dt><dd>{loadJobDraft().department || "Not selected"}</dd></div><div><dt>Job Owner / Hiring Manager</dt><dd className="summary-owner"><span><UserRound size={14} aria-hidden="true" /></span>Jane Doe</dd></div></dl>
              <div className="rules-defined"><div><span>Rules Defined</span><strong>{mustHave.length + niceToHave.length} Active</strong></div><p>{mustHave.length} Required Skills, {niceToHave.length} Bonus Skills, Min Exp: {minimumYears}yrs, Edu: {degree.replace(" Degree", "")}.</p></div>
            </section>
            <section className="criteria-help-card"><CircleHelp size={17} aria-hidden="true" /><p>Keep must-have criteria focused to preserve a useful candidate pool for review.</p></section>
          </aside>
        </div>

        <footer className="criteria-actions">
          <Link className="button" href="/jobs/new/basic-info"><ArrowLeft size={15} aria-hidden="true" />Back</Link>
          <div><button className="button save-draft-button" type="button" onClick={saveCriteria}>{saved ? "Draft saved" : "Save Draft"}</button><Link className="button primary" href="/jobs/new/scoring-weights" onClick={saveCriteria}>Continue to scoring<ArrowRight size={15} aria-hidden="true" /></Link></div>
        </footer>
      </div>
    </AppShell>
  );
}
