"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Download,
  FileText,
  Link2,
  RefreshCw,
  Search,
  Share2,
  X
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ApiError } from "@/lib/api-client";
import { fetchReport, regenerateReport, type ApiReport } from "@/features/reports/reports-api";

export function ScreeningReportDetail({ reportId = "RPT-001" }: { reportId?: string }) {
  const [report, setReport] = useState<ApiReport | null>(null);
  const [loadError, setLoadError] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    fetchReport(reportId).then((value) => { if (active) setReport(value); }).catch((error: unknown) => { if (active) setLoadError(error instanceof ApiError ? error.message : "Unable to load this report."); });
    return () => { active = false; };
  }, [reportId]);

  const candidates = report?.candidates ?? [];
  const scoreDistribution = report?.summary.scoreDistribution ?? Array(10).fill(0);
  const scoreMax = Math.max(...scoreDistribution, 1);
  const recommendationCounts = report?.summary.recommendationCounts ?? { strongRecommend: 0, recommend: 0, reviewNeeded: 0, reject: 0, pending: 0 };
  const recommendationTotal = Object.values(recommendationCounts).reduce((sum, value) => sum + value, 0) || 1;

  function exportCsv() {
    const rows = ["Rank,Candidate,Score,Recommendation", ...candidates.map((candidate, index) => [index + 1, candidate.id, candidate.score, candidate.recommendation ?? "Pending"].join(","))];
    const url = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = reportId + "-screening-report.csv";
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice("Report candidates exported as CSV.");
  }

  function downloadPdf() {
    window.print();
    setNotice("Print dialog opened. Select Save as PDF to export this report.");
  }

  async function regenerate() {
    setRegenerating(true);
    setNotice("Regenerating screening report...");
    try {
      const refreshed = await regenerateReport(reportId);
      setReport(refreshed);
      setNotice("Screening report regenerated from current database results.");
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : "Unable to regenerate this report.");
    } finally {
      setRegenerating(false);
    }
  }

  async function copyShareLink() {
    const shareLink = window.location.origin + "/reports/" + reportId;
    try {
      await navigator.clipboard.writeText(shareLink);
      setNotice("Report link copied to clipboard.");
    } catch {
      setNotice("Copy is unavailable. Use the report URL from the address bar.");
    }
  }

  return (
    <AppShell activePath="/reports" breadcrumb="Insights / Report Detail">
      <div className="screening-report-detail-page">
        <header className="screening-report-header"><div className="screening-report-breadcrumb"><Link href="/reports">Insights</Link><ChevronRight size={14} /><Link href="/reports">Reports</Link><ChevronRight size={14} /><strong>{report?.id ?? reportId}</strong></div><div className="screening-report-heading"><div><h1>{report?.title ?? reportId}</h1><p>Job: {report?.jobTitle ?? report?.jobId ?? "-"} <span>|</span> Batch: {report?.batchName ?? report?.batchId ?? "-"} <span>|</span> Generated: {report?.createdAt ? new Date(report.createdAt).toLocaleString() : "-"}</p></div><div className="screening-report-actions"><span className="report-generated-badge"><CheckCircle2 size={13} />{report?.status ?? "Loading"}</span><button className="button" type="button" onClick={downloadPdf}><FileText size={14} />Download PDF</button><button className="button" type="button" onClick={exportCsv}><Download size={14} />Export CSV</button><button className="button" type="button" onClick={() => setShareOpen(true)}><Share2 size={14} />Share link</button><button className="button primary" type="button" onClick={regenerate} disabled={regenerating}><RefreshCw size={14} className={regenerating ? "spin" : ""} />{regenerating ? "Regenerating..." : "Regenerate report"}</button></div></div></header>
        {loadError ? <div className="report-detail-footer-note" role="alert">{loadError}</div> : null}
        <section className="report-summary-grid"><article className="report-executive-summary"><h2>Executive Summary</h2><p>{report?.summary.executiveSummary ?? "Loading report summary..."}</p></article><article className="report-processing-metrics"><ReportMetric label="Candidates" value={String(report?.summary.candidateCount ?? 0)} /><ReportMetric label="Processed Files" value={String(report?.summary.processedFiles ?? 0)} tone="success" /><ReportMetric label="Scored" value={String(report?.summary.scoredCandidates ?? 0)} tone="primary" /><ReportMetric label="Strong Matches" value={String(report?.summary.strongMatches ?? 0)} tone="warning" /></article></section>
        <section className="report-detail-grid"><div className="report-detail-charts"><ReportDetailChart title="Score Distribution"><div className="detail-score-chart"><div className="detail-bars">{scoreDistribution.map((value, index) => <button type="button" style={{ height: Math.max(4, value * 100 / scoreMax) + "%" }} className={index >= 7 ? "detail-bar-primary" : "detail-bar-secondary"} aria-label={`${value} candidates in score band ${index * 10} to ${index === 9 ? 100 : index * 10 + 9}`} onClick={() => setNotice(`${value} candidate(s) in this score band.`)} key={index} />)}</div></div><div className="detail-chart-labels"><span>0</span><span>50</span><span>100</span></div></ReportDetailChart><ReportDetailChart title="Recommendation Tier"><div className="detail-tier-chart"><div className="detail-tier-stacked"><i style={{ width: percentage(recommendationCounts.strongRecommend, recommendationTotal) + "%" }} className="detail-tier-strong" /><i style={{ width: percentage(recommendationCounts.recommend, recommendationTotal) + "%" }} className="detail-tier-good" /><i style={{ width: percentage(recommendationCounts.reviewNeeded + recommendationCounts.pending, recommendationTotal) + "%" }} className="detail-tier-review" /><i style={{ width: percentage(recommendationCounts.reject, recommendationTotal) + "%" }} className="detail-tier-reject" /></div><div className="detail-tier-legend"><span><i className="detail-tier-strong" />Strong {recommendationCounts.strongRecommend}</span><span><i className="detail-tier-good" />Recommend {recommendationCounts.recommend}</span><span><i className="detail-tier-review" />Review/Pending {recommendationCounts.reviewNeeded + recommendationCounts.pending}</span><span><i className="detail-tier-reject" />Reject {recommendationCounts.reject}</span></div></div></ReportDetailChart></div><section className="top-ranked-card"><header><div><h2>Ranked Candidates</h2><p>Profiles from this screening batch, ordered by score</p></div><Link href="/candidates/ranked">Open all candidates <ArrowRight size={13} /></Link></header><div className="top-ranked-table-wrap"><table className="top-ranked-table"><thead><tr><th>Rank</th><th>Candidate (Anonymized)</th><th>Score</th><th>Tier</th><th>Decision</th><th>Profile</th></tr></thead><tbody>{candidates.map((candidate, index) => <tr key={candidate.id}><td>#{index + 1}</td><td><Link href={"/candidates/" + candidate.id + "/profile"}>{candidate.id}</Link></td><td><strong className={candidate.score >= 85 ? "report-score-success" : "report-score-primary"}>{Math.round(candidate.score)}/100</strong></td><td><span className={"report-tier-pill " + (candidate.score >= 85 ? "strong" : "good")}>{formatRecommendation(candidate.recommendation)}</span></td><td>{formatRecommendation(candidate.recommendation)}</td><td><Link className="report-open-profile" href={"/candidates/" + candidate.id + "/match-analysis"} aria-label={"Open " + candidate.id}><Search size={14} /></Link></td></tr>)}{!candidates.length ? <tr><td colSpan={6}>No candidates belong to this report batch.</td></tr> : null}</tbody></table></div></section></section>
        <div className="report-detail-footer-note"><Link className="button" href="/reports"><ArrowLeft size={14} />Back to reports</Link><span><FileText size={14} />Generated from {report?.id ?? reportId} with the active screening rubric</span></div>
        {shareOpen ? <div className="report-modal-backdrop"><section className="report-share-modal" role="dialog" aria-modal="true" aria-labelledby="share-report-title"><header><h2 id="share-report-title"><Link2 size={16} />Share Report</h2><button type="button" aria-label="Close share dialog" onClick={() => setShareOpen(false)}><X size={16} /></button></header><div><p>Anyone with this link can view the report.</p><div className="report-share-input"><input readOnly value={typeof window === "undefined" ? "" : window.location.origin + "/reports/" + reportId} /><button type="button" onClick={copyShareLink}>Copy</button></div></div><footer><button className="button" type="button" onClick={() => setShareOpen(false)}>Close</button></footer></section></div> : null}
        {notice ? <div className="report-detail-toast" role="status"><CheckCircle2 size={15} />{notice}<button type="button" aria-label="Dismiss notice" onClick={() => setNotice("")}><X size={14} /></button></div> : null}
      </div>
    </AppShell>
  );
}

function ReportMetric({ label, value, tone = "default" }: { label: string; value: string; tone?: string }) {
  return <div><span>{label}</span><strong className={tone}>{value}</strong></div>;
}

function ReportDetailChart({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="report-detail-chart"><h2>{title}</h2>{children}</section>;
}

function percentage(value: number, total: number) {
  return Math.round(value * 100 / Math.max(total, 1));
}

function formatRecommendation(value: string | null) {
  return value ? value.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ") : "Pending";
}
