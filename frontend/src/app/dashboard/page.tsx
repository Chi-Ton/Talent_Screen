"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  CloudCog,
  FileText,
  Flag,
  Info,
  Layers3,
  TrendingUp,
  UserRound,
  Verified,
  XCircle
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ApiError } from "@/lib/api-client";
import { DashboardData, fetchDashboardData } from "@/features/dashboard/dashboard-api";

type DateRange = "7" | "30" | "90";

type DistributionItem = { label: string; value: number; color: string };

const rangeLabels: Record<DateRange, string> = {
  "7": "Last 7 Days",
  "30": "Last 30 Days",
  "90": "Last 90 Days"
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function getProgress(batch: DashboardData["batches"][number]) {
  return batch.totalFiles > 0 ? Math.round((batch.processedFiles / batch.totalFiles) * 100) : 0;
}

function getMetrics(data: DashboardData | null) {
  if (!data) return [
    { label: "Total CVs", value: "...", note: "Loading connected data", tone: "neutral" as const },
    { label: "Processed", value: "...", note: "Loading connected data", tone: "neutral" as const },
    { label: "Strong Matches", value: "...", note: "Loading connected data", tone: "neutral" as const },
    { label: "Average Score", value: "...", note: "Loading connected data", tone: "neutral" as const }
  ];

  const totalCvs = data.batches.reduce((sum, batch) => sum + batch.totalFiles, 0);
  const processed = data.batches.reduce((sum, batch) => sum + batch.processedFiles, 0);
  const strongMatches = data.jobs.reduce((sum, job) => sum + job.strongMatches, 0);
  const scoredCandidates = data.candidates.filter((candidate) => candidate.score > 0);
  const averageScore = scoredCandidates.length
    ? scoredCandidates.reduce((sum, candidate) => sum + candidate.score, 0) / scoredCandidates.length
    : 0;
  const processingRate = totalCvs ? Math.round((processed / totalCvs) * 100) : 0;

  return [
    { label: "Total CVs", value: formatNumber(totalCvs), note: `${data.batches.length} connected batch${data.batches.length === 1 ? "" : "es"}`, tone: "positive" as const },
    { label: "Processed", value: formatNumber(processed), note: `${processingRate}% processing rate`, tone: "neutral" as const },
    { label: "Strong Matches", value: formatNumber(strongMatches), note: "From active job scoring", tone: "positive" as const },
    { label: "Average Score", value: `${Math.round(averageScore)}%`, note: "Across loaded candidates", tone: "neutral" as const }
  ];
}

function getDistribution(data: DashboardData | null): DistributionItem[] {
  const candidates = data?.candidates ?? [];
  return [
    { label: "0-49", value: candidates.filter((candidate) => candidate.score < 50).length, color: "#cbd5e1" },
    { label: "50-69", value: candidates.filter((candidate) => candidate.score >= 50 && candidate.score < 70).length, color: "#93c5fd" },
    { label: "70-84", value: candidates.filter((candidate) => candidate.score >= 70 && candidate.score < 85).length, color: "#2563eb" },
    { label: "85-100", value: candidates.filter((candidate) => candidate.score >= 85).length, color: "#0f766e" }
  ];
}

function getActivityValues(data: DashboardData | null) {
  const total = data?.batches.reduce((sum, batch) => sum + batch.totalFiles, 0) ?? 0;
  const processed = data?.batches.reduce((sum, batch) => sum + batch.processedFiles, 0) ?? 0;
  const progress = total ? Math.round((processed / total) * 100) : 0;
  return [0, Math.round(progress * 0.35), Math.round(progress * 0.7), progress];
}

function ActivityChart({ values }: { values: number[] }) {
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 100},${100 - value}`).join(" ");

  return (
    <div className="activity-chart" aria-label="Screening activity line chart">
      <div className="chart-grid-lines" aria-hidden="true">
        <span /><span /><span /><span />
      </div>
      <svg className="activity-line" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Screening volume trend">
        <polygon points={`0,100 ${points} 100,100`} className="activity-area" />
        <polyline points={points} className="activity-polyline" />
      </svg>
      <div className="chart-labels" aria-hidden="true">
        <span>Week 1</span><span>Week 2</span><span>Week 3</span><span>Week 4</span>
      </div>
    </div>
  );
}

function DistributionChart({ data }: { data: DistributionItem[] }) {
  return (
    <div className="distribution-chart" aria-label="Candidate score distribution bar chart">
      <div className="distribution-bars">
        {data.map((item) => (
          <div className="distribution-column" key={item.label}>
            <span className="distribution-value">{item.value}</span>
            <span className="distribution-bar" style={{ height: `${Math.max(item.value * 1.35, 24)}px`, backgroundColor: item.color }} />
            <span className="distribution-label">{item.label}</span>
          </div>
        ))}
      </div>
      <div className="distribution-axis" aria-hidden="true" />
    </div>
  );
}

export default function DashboardPage() {
  const [range, setRange] = useState<DateRange>("30");
  const [query, setQuery] = useState("");
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let isCurrent = true;
    fetchDashboardData()
      .then((data) => {
        if (isCurrent) setDashboard(data);
      })
      .catch((error) => {
        if (!isCurrent) return;
        setLoadError(error instanceof ApiError ? error.message : "Unable to load dashboard data.");
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  const metrics = useMemo(() => getMetrics(dashboard), [dashboard]);
  const distribution = useMemo(() => getDistribution(dashboard), [dashboard]);
  const activity = useMemo(() => getActivityValues(dashboard), [dashboard]);
  const jobTitles = useMemo(() => new Map((dashboard?.jobs ?? []).map((job) => [job.id, job.title])), [dashboard]);
  const batches = useMemo(
    () => (dashboard?.batches ?? []).map((batch) => ({
      id: batch.id,
      name: batch.name,
      role: jobTitles.get(batch.jobId) ?? "Unknown job",
      progress: getProgress(batch),
      status: batch.status,
      eta: batch.status === "processing" ? `${batch.totalFiles - batch.processedFiles} remaining` : "-",
      href: `/batches/${batch.id}`
    })),
    [dashboard, jobTitles]
  );
  const filteredBatches = useMemo(
    () => batches.filter((batch) => `${batch.name} ${batch.role} ${batch.status}`.toLowerCase().includes(query.toLowerCase())),
    [batches, query]
  );
  const attentionItems = useMemo(() => {
    const failedBatches = (dashboard?.batches ?? []).filter((batch) => batch.failedFiles > 0);
    const reviewCandidates = (dashboard?.candidates ?? []).filter((candidate) => candidate.recommendation === "review_needed");
    return [
      ...failedBatches.map((batch) => ({
        icon: AlertTriangle,
        title: `${batch.failedFiles} file${batch.failedFiles === 1 ? "" : "s"} failed to parse`,
        detail: `Batch: ${batch.name}`,
        href: `/batches/${batch.id}`,
        tone: "danger"
      })),
      ...reviewCandidates.slice(0, 2).map((candidate) => ({
        icon: Flag,
        title: "Review candidate match",
        detail: `Candidate: ${candidate.name}`,
        href: "/review-queue",
        tone: "warning"
      }))
    ];
  }, [dashboard]);

  return (
    <AppShell activePath="/dashboard" breadcrumb="Overview" searchValue={query} onSearchChange={setQuery}>
      <section className="page-header dashboard-header">
        <div>
          <h1 className="page-title">Dashboard Overview</h1>
          <p className="page-subtitle">Operational snapshot for AI-assisted IT candidate screening.</p>
        </div>
        <label className="range-select">
          <CalendarDays size={15} aria-hidden="true" />
          <span className="sr-only">Dashboard time range</span>
          <select value={range} onChange={(event) => setRange(event.target.value as DateRange)}>
            <option value="7">Last 7 Days</option>
            <option value="30">Last 30 Days</option>
            <option value="90">Last 90 Days</option>
          </select>
          <ChevronDown size={15} aria-hidden="true" />
        </label>
      </section>

      {loadError ? <div className="inline-error" role="alert">{loadError} Please sign in again or refresh the page.</div> : null}

      <section className="grid metrics" aria-label="Dashboard metrics">
        {metrics.map((metric, index) => (
          <article className="card metric-card" key={metric.label}>
            <div className="metric-topline">
              <span className="metric-label">{metric.label}</span>
              {index === 0 ? <FileText size={17} /> : null}
              {index === 1 ? <CloudCog size={17} /> : null}
              {index === 2 ? <Verified size={17} /> : null}
              {index === 3 ? <BarChart3 size={17} /> : null}
            </div>
            <div className="metric-value">{metric.value}</div>
            <div className={`metric-note ${metric.tone}`}>
              {metric.tone === "positive" ? <TrendingUp size={14} aria-hidden="true" /> : null}
              <span>{metric.note}</span>
            </div>
          </article>
        ))}
      </section>

      <section className="grid dashboard-charts">
        <article className="card chart-card activity-card">
          <div className="card-heading">
            <div>
              <h2 className="card-title">Screening Activity</h2>
              <p className="card-description">Current CV processing progress from connected batches.</p>
            </div>
            <Link className="text-button" href="/reports">View Report</Link>
          </div>
          <ActivityChart values={activity} />
        </article>

        <article className="card chart-card">
          <div className="card-heading">
            <div>
              <h2 className="card-title">Score Distribution</h2>
              <p className="card-description">Candidates grouped by match score.</p>
            </div>
            <Info size={16} className="muted-icon" aria-label="Scores use the active rubric" />
          </div>
          <DistributionChart data={distribution} />
        </article>
      </section>

      <section className="grid dashboard-bottom">
        <article className="card batches-card">
          <div className="card-heading">
            <div>
              <h2 className="card-title">Active Batches</h2>
              <p className="card-description">Current CV screening jobs requiring monitoring.</p>
            </div>
            <Link className="button primary compact-button" href="/batches/upload">
              <Layers3 size={15} aria-hidden="true" />
              New Batch
            </Link>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Batch Name</th>
                  <th>Job Role</th>
                  <th>Progress</th>
                  <th>Status</th>
                  <th className="align-right">Est. Time</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? <tr><td colSpan={5} className="empty-cell">Loading connected batches...</td></tr> : null}
                {!isLoading && filteredBatches.map((batch) => (
                  <tr key={batch.id}>
                    <td><Link className="table-link" href={batch.href}>{batch.name}</Link></td>
                    <td className="muted-cell">{batch.role}</td>
                    <td>
                      <div className="progress-wrap">
                        <div className="progress" aria-label={`${batch.progress}% complete`}><span style={{ width: `${batch.progress}%` }} /></div>
                        <span className="progress-value">{batch.progress}%</span>
                      </div>
                    </td>
                    <td><span className={`status ${batch.status === "completed" ? "success" : "info"}`}>{batch.status.replaceAll("_", " ")}</span></td>
                    <td className="align-right muted-cell">{batch.eta}</td>
                  </tr>
                ))}
                {!isLoading && filteredBatches.length === 0 ? (
                  <tr><td colSpan={5} className="empty-cell">No active batches match &quot;{query}&quot;.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>

        <aside className="stack">
          <article className="card attention-card">
            <div className="card-heading compact-heading">
              <h2 className="card-title danger-title"><XCircle size={17} aria-hidden="true" /> Needs Attention</h2>
            </div>
            <div className="attention-list">
              {attentionItems.length === 0 ? <p className="card-description">No attention items from the connected data.</p> : null}
              {attentionItems.map((item) => {
                const Icon = item.icon;
                return <Link className={`attention-item ${item.tone}`} href={item.href} key={item.href + item.title + item.detail}>
                  <Icon size={17} aria-hidden="true" />
                  <span><strong>{item.title}</strong><small>{item.detail}</small></span>
                </Link>;
              })}
            </div>
          </article>

          <article className="card recent-card">
            <h2 className="card-title">Recent Activity</h2>
            <div className="timeline">
              {(dashboard?.reports ?? []).slice(0, 3).map((report) => (
                <div className="timeline-item" key={report.id}><CheckCircle2 size={15} aria-hidden="true" /><span><strong>{report.title}</strong><small>{report.status.replaceAll("_", " ")}</small></span></div>
              ))}
              {!isLoading && (dashboard?.reports ?? []).length === 0 ? <p className="card-description">No recent reports.</p> : null}
            </div>
          </article>
        </aside>
      </section>
    </AppShell>
  );
}
