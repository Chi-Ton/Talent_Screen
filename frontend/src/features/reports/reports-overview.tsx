"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, BarChart3, CalendarDays, CheckCircle2, ChevronRight, Download, FileWarning, FolderOpen, RefreshCw, Search, Users, X } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ApiError } from "@/lib/api-client";
import { fetchReports, type ApiReport, type ApiReportSkill } from "@/features/reports/reports-api";

export function ReportsOverview() {
  const [reports, setReports] = useState<ApiReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [period, setPeriod] = useState("Last 30 Days");
  const [job, setJob] = useState("All Jobs");
  const [batch, setBatch] = useState("All Batches");
  const [notice, setNotice] = useState("");

  const loadReports = useCallback(async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      setReports(await fetchReports());
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : "Unable to load reports.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadReports(); }, [loadReports]);

  const jobOptions = useMemo(() => Array.from(new Set(reports.map((report) => report.jobTitle).filter((value): value is string => Boolean(value)))), [reports]);
  const batchOptions = useMemo(() => reports.filter((report) => report.batchId).map((report) => ({ id: report.batchId as string, name: report.batchName ?? report.batchId as string })), [reports]);
  const visibleReports = useMemo(() => reports.filter((report) => {
    const jobMatches = job === "All Jobs" || report.jobTitle === job;
    const batchMatches = batch === "All Batches" || report.batchId === batch;
    return jobMatches && batchMatches && isWithinPeriod(report.createdAt, period);
  }), [batch, job, period, reports]);
  const aggregate = useMemo(() => aggregateReports(visibleReports), [visibleReports]);

  function exportReport() {
    const rows = [
      "Metric,Value",
      `Reports,${visibleReports.length}`,
      `Candidates,${aggregate.candidateCount}`,
      `Scored,${aggregate.scoredCandidates}`,
      `Average score,${aggregate.averageScore}`,
      `Strong recommendations,${aggregate.recommendationCounts.strongRecommend}`,
      `Failed files,${aggregate.failedFiles}`,
    ];
    const url = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "talentscreen-report.csv";
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice("Report exported as CSV.");
  }

  async function refresh() {
    await loadReports();
    setNotice("Report data refreshed from the screening API.");
  }

  const recommendationTotal = Object.values(aggregate.recommendationCounts).reduce((sum, value) => sum + value, 0) || 1;
  const scoreMax = Math.max(...aggregate.scoreDistribution, 1);

  return (
    <AppShell activePath="/reports" breadcrumb="Insights / Reports">
      <div className="reports-overview-page">
        <header className="reports-overview-header"><div className="reports-breadcrumb"><Link href="/dashboard">Insights</Link><ChevronRight size={14} /><strong>Reports</strong></div><div className="reports-title-row"><h1>Reports Overview</h1><div className="reports-filters"><label><CalendarDays size={14} /><span className="sr-only">Period</span><select value={period} onChange={(event) => setPeriod(event.target.value)}><option>Last 30 Days</option><option>This Quarter</option><option>Year to Date</option><option>All Time</option></select></label><label><BarChart3 size={14} /><span className="sr-only">Job</span><select value={job} onChange={(event) => setJob(event.target.value)}><option>All Jobs</option>{jobOptions.map((value) => <option key={value}>{value}</option>)}</select></label><label><FolderOpen size={14} /><span className="sr-only">Batch</span><select value={batch} onChange={(event) => setBatch(event.target.value)}><option>All Batches</option>{batchOptions.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><button className="button" type="button" onClick={refresh} disabled={isLoading}><RefreshCw size={14} className={isLoading ? "spin" : ""} />Refresh</button><button className="button primary" type="button" onClick={exportReport} disabled={!visibleReports.length}><Download size={14} />Export report</button></div></div></header>
        {loadError ? <div className="report-detail-footer-note" role="alert"><AlertTriangle size={14} />{loadError}</div> : null}
        <section className="reports-kpi-grid" aria-label="Report summary"><ReportKpi label="Reports Generated" value={String(visibleReports.length)} /><ReportKpi label="Candidates Covered" value={aggregate.candidateCount.toLocaleString()} /><ReportKpi label="Average Score" value={`${aggregate.averageScore.toFixed(1)}%`} /><ReportKpi label="Strong Matches" value={String(aggregate.recommendationCounts.strongRecommend)} /><ReportKpi label="Failed Files" value={String(aggregate.failedFiles)} negative={aggregate.failedFiles > 0} /></section>

        <div className="reports-chart-grid">
          <ReportCard title="Score Distribution" subtitle="Actual completed candidate scores"><div className="score-distribution-chart"><div className="score-axis"><span>{scoreMax}</span><span>{Math.round(scoreMax / 2)}</span><span>0</span></div><div className="score-bars">{aggregate.scoreDistribution.map((value, index) => <button type="button" className={index >= 7 ? "primary-bar" : "secondary-bar"} style={{ height: `${Math.max(4, value * 100 / scoreMax)}%` }} aria-label={`${value} candidates scored ${index * 10}-${index === 9 ? 100 : index * 10 + 9}`} onClick={() => setNotice(`${value} candidate(s) in score band ${index * 10}-${index === 9 ? 100 : index * 10 + 9}.`)} key={index} />)}</div></div><div className="chart-axis-labels"><span>0-9</span><span>50-59</span><span>90-100</span></div></ReportCard>
          <ReportCard title="Recommendation Tier" subtitle="Evidence-grounded screening decisions"><div className="tier-chart"><div className="tier-stacked"><i className="tier-strong" style={{ width: percent(aggregate.recommendationCounts.strongRecommend, recommendationTotal) + "%" }} /><i className="tier-recommend" style={{ width: percent(aggregate.recommendationCounts.recommend, recommendationTotal) + "%" }} /><i className="tier-review" style={{ width: percent(aggregate.recommendationCounts.reviewNeeded + aggregate.recommendationCounts.pending, recommendationTotal) + "%" }} /><i className="tier-reject" style={{ width: percent(aggregate.recommendationCounts.reject, recommendationTotal) + "%" }} /></div><div className="tier-legend"><span><i className="tier-strong" />Strong {aggregate.recommendationCounts.strongRecommend}</span><span><i className="tier-recommend" />Recommend {aggregate.recommendationCounts.recommend}</span><span><i className="tier-review" />Review/Pending {aggregate.recommendationCounts.reviewNeeded + aggregate.recommendationCounts.pending}</span><span><i className="tier-reject" />Reject {aggregate.recommendationCounts.reject}</span></div></div></ReportCard>
          <ReportCard title="Screening Funnel" subtitle="Files accepted through completed scoring"><div className="screening-funnel"><FunnelRow label="Processed files" value={String(aggregate.processedFiles)} width={100} /><FunnelRow label="Candidate profiles" value={String(aggregate.candidateCount)} width={percent(aggregate.candidateCount, Math.max(aggregate.processedFiles, 1))} /><FunnelRow label="Scored candidates" value={String(aggregate.scoredCandidates)} width={percent(aggregate.scoredCandidates, Math.max(aggregate.processedFiles, 1))} /><FunnelRow label="Strong matches" value={String(aggregate.strongMatches)} width={percent(aggregate.strongMatches, Math.max(aggregate.processedFiles, 1))} /></div></ReportCard>
          <ReportCard title="Top Matched Skills" subtitle="Skills explicitly found in CV evidence"><SkillBars values={aggregate.topMatchedSkills} tone="matched" /></ReportCard>
          <ReportCard title="Top Missing Skills" subtitle="Configured job skills absent from CV evidence"><SkillBars values={aggregate.topMissingSkills} tone="missing" /></ReportCard>
          <ReportCard title="Data Quality" subtitle="Processing outcomes requiring attention"><div className="quality-list"><QualityItem label="Failed files" detail="Text extraction or AI processing failed" value={String(aggregate.failedFiles)} tone={aggregate.failedFiles ? "warning" : "success"} href="/batches" /><QualityItem label="Pending scores" detail="Candidate requires a live grounded rescore" value={String(aggregate.recommendationCounts.pending)} tone={aggregate.recommendationCounts.pending ? "warning" : "success"} href="/review-queue" /></div></ReportCard>
        </div>

        <section className="recent-reports-card"><header><div><h2>Generated Reports</h2><p>One report per completed or partially completed screening batch</p></div><Users size={18} /></header><div className="reports-table-wrap"><table><thead><tr><th>Report</th><th>Job</th><th>Batch</th><th>Generated</th><th>Candidates</th><th>Status</th><th>Open</th></tr></thead><tbody>{visibleReports.map((report) => <ReportRow report={report} key={report.id} />)}{!isLoading && !visibleReports.length ? <tr><td colSpan={7}>No reports match the selected filters.</td></tr> : null}</tbody></table></div></section>
        {notice ? <div className="reports-toast" role="status"><CheckCircle2 size={15} />{notice}<button type="button" aria-label="Dismiss notice" onClick={() => setNotice("")}><X size={14} /></button></div> : null}
      </div>
    </AppShell>
  );
}

function ReportKpi({ label, value, negative = false }: { label: string; value: string; negative?: boolean }) {
  return <article className="report-kpi"><span>{label}</span><div><strong>{value}</strong>{negative ? <small className="negative"><FileWarning size={12} />Attention</small> : <small className="positive"><CheckCircle2 size={12} />Live</small>}</div></article>;
}

function ReportCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <section className="report-chart-card"><header><h2>{title}</h2><p>{subtitle}</p></header>{children}</section>;
}

function FunnelRow({ label, value, width }: { label: string; value: string; width: number }) {
  return <div className="funnel-row"><span>{label}</span><div><i style={{ width: width + "%" }} /></div><strong>{value}</strong></div>;
}

function SkillBars({ values, tone }: { values: ApiReportSkill[]; tone: "matched" | "missing" }) {
  return <div className={`skill-bars ${tone}`}>{values.length ? values.map((item) => <div className="skill-bar-row" key={item.label}><span>{item.label} ({item.count})</span><div><i style={{ width: item.percentage + "%" }} /></div></div>) : <p>No skill evidence is available.</p>}</div>;
}

function QualityItem({ label, detail, value, tone, href }: { label: string; detail: string; value: string; tone: string; href: string }) {
  return <Link className={`quality-item ${tone}`} href={href}><span><strong>{label}</strong><small>{detail}</small></span><b>{value}</b></Link>;
}

function ReportRow({ report }: { report: ApiReport }) {
  const complete = report.status.toLowerCase() === "completed";
  return <tr><td><Link href={`/reports/${report.id}`}>{report.title}</Link></td><td>{report.jobTitle ?? report.jobId ?? "-"}</td><td>{report.batchName ?? report.batchId ?? "-"}</td><td>{formatDate(report.createdAt)}</td><td>{report.summary.candidateCount}</td><td><span className={`report-status ${complete ? "complete" : "generating"}`}>{complete ? <CheckCircle2 size={11} /> : <RefreshCw size={11} />}{complete ? "Complete" : report.status}</span></td><td><Link className="report-row-action" href={`/reports/${report.id}`} aria-label={`Open ${report.title}`}><Search size={15} /></Link></td></tr>;
}

function aggregateReports(reports: ApiReport[]) {
  const scoreDistribution = Array(10).fill(0) as number[];
  const recommendationCounts = { strongRecommend: 0, recommend: 0, reviewNeeded: 0, reject: 0, pending: 0 };
  const matched = new Map<string, number>();
  const missing = new Map<string, number>();
  let candidateCount = 0;
  let processedFiles = 0;
  let failedFiles = 0;
  let scoredCandidates = 0;
  let weightedScore = 0;
  for (const report of reports) {
    const summary = report.summary;
    candidateCount += summary.candidateCount;
    processedFiles += summary.processedFiles;
    failedFiles += summary.failedFiles;
    scoredCandidates += summary.scoredCandidates;
    weightedScore += summary.averageScore * summary.scoredCandidates;
    summary.scoreDistribution.forEach((value, index) => { scoreDistribution[index] += value; });
    Object.keys(recommendationCounts).forEach((key) => { recommendationCounts[key as keyof typeof recommendationCounts] += summary.recommendationCounts[key as keyof typeof recommendationCounts]; });
    summary.topMatchedSkills.forEach((item) => matched.set(item.label, (matched.get(item.label) ?? 0) + item.count));
    summary.topMissingSkills.forEach((item) => missing.set(item.label, (missing.get(item.label) ?? 0) + item.count));
  }
  return {
    candidateCount,
    processedFiles,
    failedFiles,
    scoredCandidates,
    averageScore: scoredCandidates ? weightedScore / scoredCandidates : 0,
    strongMatches: recommendationCounts.strongRecommend,
    recommendationCounts,
    scoreDistribution,
    topMatchedSkills: skillMap(matched, candidateCount),
    topMissingSkills: skillMap(missing, candidateCount),
  };
}

function skillMap(values: Map<string, number>, candidateCount: number): ApiReportSkill[] {
  return [...values.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([label, count]) => ({ label, count, percentage: percent(count, Math.max(candidateCount, 1)) }));
}

function percent(value: number, total: number) {
  return Math.round(value * 100 / Math.max(total, 1));
}

function isWithinPeriod(value: string, period: string) {
  if (period === "All Time") return true;
  const created = new Date(value);
  const now = new Date();
  if (period === "Last 30 Days") return created.getTime() >= now.getTime() - 30 * 24 * 60 * 60 * 1000;
  if (period === "This Quarter") return created.getFullYear() === now.getFullYear() && Math.floor(created.getMonth() / 3) === Math.floor(now.getMonth() / 3);
  return created.getFullYear() === now.getFullYear();
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
