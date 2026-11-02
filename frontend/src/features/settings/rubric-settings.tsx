"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BarChart3, CheckCircle2, ChevronRight, History, ShieldAlert } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ApiError } from "@/lib/api-client";
import { fetchRubric, type ApiRubric } from "@/features/settings/settings-api";

export function RubricSettings() {
  const [rubric, setRubric] = useState<ApiRubric | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetchRubric().then(setRubric).catch((reason: unknown) => setError(reason instanceof ApiError ? reason.message : "Unable to load rubric settings."));
  }, []);
  return <AppShell activePath="/settings/rubric" breadcrumb="Administration / Settings / Screening Rubric"><div className="ai-taxonomy-page"><header className="ai-taxonomy-header"><div className="ai-taxonomy-breadcrumb"><Link href="/admin/users-roles">Administration</Link><ChevronRight size={14} /><strong>Settings / Screening Rubric</strong></div><h1>Screening Rubric Settings</h1><nav className="settings-section-tabs"><button className="active" type="button">Screening rubric</button><Link href="/settings/ai-taxonomy">AI &amp; taxonomy</Link><Link href="/settings/account">Account &amp; security</Link></nav></header>{error ? <p role="alert">{error}</p> : rubric ? <><section className="ai-engine-card"><header><div><h2>{rubric.name}</h2><p>Version {rubric.version} · Standard rubric used by new job openings.</p></div><span className="provider-status"><CheckCircle2 size={13} />{rubric.totalWeight}% configured</span></header><div className="taxonomy-groups">{rubric.criteria.map((criterion) => <article key={criterion.criterionCode}><header><div><h3>{criterion.pillarName}</h3><span>{criterion.criterionName}</span></div><strong>{criterion.weight}%</strong></header><p>{criterion.description ?? "Configured scoring criterion."}</p></article>)}</div></section><section className="taxonomy-panel"><header><div><h2><ShieldAlert size={16} />Minimum disqualifiers</h2><p>Rules applied before recommendation thresholds.</p></div><Link className="button" href="/jobs/new/scoring-weights"><BarChart3 size={14} />Configure in job setup</Link></header><div className="privacy-options">{rubric.disqualifiers.map((rule) => <div className="notification-toggle" key={rule.type}><span><strong>{rule.label}</strong><small>{rule.enabled ? "Enabled" : "Disabled"}</small></span><CheckCircle2 size={16} /></div>)}</div></section></> : <p role="status">Loading rubric...</p>}<footer className="ai-processing-footer"><Link href="/admin/audit-logs"><History size={13} />View Audit Trail</Link></footer></div></AppShell>;
}
