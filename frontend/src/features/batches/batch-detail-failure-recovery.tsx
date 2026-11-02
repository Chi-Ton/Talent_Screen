"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Download,
  FileText,
  FolderOpen,
  History,
  Info,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ApiError } from "@/lib/api-client";
import { fetchBatch, retryBatchFailures, type ApiBatch, type ApiBatchFile } from "@/features/batches/screening-api";

type ErrorCategory = "Unsupported format" | "OCR failure" | "Password protected" | "AI timeout" | "Processing failure";

const failureCategories: ErrorCategory[] = ["Unsupported format", "OCR failure", "Password protected", "AI timeout", "Processing failure"];
const tabs = ["Summary", "Files", "Errors", "Processing log"] as const;

export function BatchDetailFailureRecovery({ batchId = "BAT-001" }: { batchId?: string }) {
  const [batch, setBatch] = useState<ApiBatch | null>(null);
  const [files, setFiles] = useState<ApiBatchFile[]>([]);
  const [loadError, setLoadError] = useState("");
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>("Files");
  const [activeCategory, setActiveCategory] = useState<ErrorCategory | "All">("All");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    fetchBatch(batchId).then((value) => {
      if (!active) return;
      setBatch(value);
      setFiles(value.files ?? []);
      setLoadError("");
    }).catch((error: unknown) => {
      if (active) setLoadError(error instanceof ApiError ? error.message : "Unable to load this batch.");
    });
    return () => { active = false; };
  }, [batchId]);

  const failures = useMemo(() => files.filter((file) => file.status.toLowerCase() === "failed"), [files]);
  const visibleFiles = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return files.filter((file) => !normalized || `${file.name} ${file.candidateId ?? ""} ${file.candidateName ?? ""}`.toLowerCase().includes(normalized));
  }, [files, query]);
  const visibleFailures = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return failures.filter((file) => (!normalized || `${file.name} ${file.errorMessage ?? ""}`.toLowerCase().includes(normalized))
      && (activeCategory === "All" || failureCategory(file) === activeCategory));
  }, [activeCategory, failures, query]);

  async function refreshBatch() {
    const value = await fetchBatch(batchId);
    setBatch(value);
    setFiles(value.files ?? []);
  }

  async function retryAll() {
    try {
      const result = await retryBatchFailures(batchId);
      await refreshBatch();
      setNotice(result.retriedFiles ? `Retry started for ${result.retriedFiles} failed file${result.retriedFiles === 1 ? "" : "s"}.` : "This batch has no failed files to retry.");
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : "Unable to retry failed files.");
    }
  }

  function downloadResultsCsv() {
    const rows = [
      "File name,Status,Parser status,Candidate ID,Candidate name,Score,Recommendation,Error",
      ...files.map((file) => [file.name, statusLabel(file.status), file.parserStatus ?? "", file.candidateId ?? "", file.candidateName ?? "", file.score ?? "", file.recommendation ?? "", file.errorMessage ?? ""].map(csvValue).join(",")),
    ];
    const url = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${batchId}-results.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice("Batch results exported.");
  }

  const candidateHref = batch ? `/results?jobId=${encodeURIComponent(batch.jobId)}&batchId=${encodeURIComponent(batch.id)}` : "/results";
  const status = batch?.status ?? "queued";

  return (
    <AppShell activePath="/results" breadcrumb="CV Screening / Evaluation Details">
      <div className="failure-recovery-page">
        <header className="failure-recovery-header">
          <div>
            <div className="failure-recovery-breadcrumb"><Link href="/screen">CV Screening</Link><ChevronRightIcon /><Link href="/results">Results</Link><ChevronRightIcon /><strong>Evaluation details</strong></div>
            <div className="failure-recovery-title-row"><h1 className="page-title">{batch?.name ?? batchId}</h1><span className={`failure-recovery-status ${statusTone(status)}`}>{status === "completed" ? <CheckCircle2 size={13} aria-hidden="true" /> : <AlertTriangle size={13} aria-hidden="true" />}{statusLabel(status)}</span></div>
            <div className="failure-recovery-meta"><span><FolderOpen size={14} />{batch?.ownerName ?? "-"}</span><span><CalendarDays size={14} />{formatDate(batch?.createdAt)}</span></div>
          </div>
          <div className="failure-recovery-actions"><button className="button" type="button" onClick={downloadResultsCsv} disabled={!files.length}><Download size={14} />Export results</button><button className="button primary" type="button" onClick={retryAll} disabled={!failures.length}><RefreshCw size={14} />Retry failed files</button></div>
        </header>

        {loadError ? <div className="failure-recovery-note" role="alert"><Info size={16} aria-hidden="true" /><span>{loadError}</span></div> : null}
        {!loadError && batch ? <div className="failure-recovery-note"><Info size={16} aria-hidden="true" /><span>{batch.failedFiles ? "Successful candidate results are preserved while failed files are retried." : `All ${batch.processedFiles} processed CV${batch.processedFiles === 1 ? "" : "s"} are available below.`}</span></div> : null}

        <section className="failure-recovery-metrics" aria-label="Batch summary">
          <Metric label="Total Files" value={String(batch?.totalFiles ?? 0)} /><Metric label="Successful" value={String(batch?.processedFiles ?? 0)} tone="success" /><Metric label="Failed" value={String(batch?.failedFiles ?? 0)} tone={batch?.failedFiles ? "danger" : "muted"} /><Metric label="Duplicates" value={String(batch?.duplicateFiles ?? 0)} tone="muted" /><Metric label="Processing Time" value={processingDuration(batch)} tone="muted" /><Metric label="Candidate Profiles" value={String(files.filter((file) => file.candidateId).length)} tone="muted" />
        </section>

        <nav className="failure-recovery-tabs" aria-label="Batch detail views">
          {tabs.map((tab) => <button className={activeTab === tab ? "active" : ""} type="button" key={tab} onClick={() => { setActiveTab(tab); setQuery(""); }}>{tab}{tab === "Files" ? <b>{batch?.totalFiles ?? files.length}</b> : null}{tab === "Errors" ? <b className={failures.length ? "error-count" : ""}>{failures.length}</b> : null}</button>)}
        </nav>

        {activeTab === "Files" ? <FilesTab files={visibleFiles} totalFiles={files.length} query={query} setQuery={setQuery} jobId={batch?.jobId} /> : null}
        {activeTab === "Errors" ? <ErrorsTab failures={visibleFailures} allFailures={failures} activeCategory={activeCategory} setActiveCategory={setActiveCategory} query={query} setQuery={setQuery} retryAll={retryAll} candidateHref={candidateHref} /> : null}
        {activeTab === "Summary" ? <SummaryTab batch={batch} candidateHref={candidateHref} /> : null}
        {activeTab === "Processing log" ? <ProcessingLogTab batch={batch} files={files} /> : null}

        {notice ? <div className="failure-recovery-toast" role="status"><CheckCircle2 size={17} />{notice}<button type="button" aria-label="Dismiss notice" onClick={() => setNotice("")}><X size={15} /></button></div> : null}
      </div>
    </AppShell>
  );
}

function FilesTab({ files, totalFiles, query, setQuery, jobId }: { files: ApiBatchFile[]; totalFiles: number; query: string; setQuery: (value: string) => void; jobId?: string }) {
  return <div className="failure-recovery-content">
    <div className="failure-action-bar"><div className="failure-search"><Search size={15} /><input placeholder="Search uploaded files..." value={query} onChange={(event) => setQuery(event.target.value)} /></div><span className="muted-cell">Showing {files.length} of {totalFiles} file{totalFiles === 1 ? "" : "s"}</span></div>
    <div className="failure-table-wrap"><table className="failure-table"><thead><tr><th>File name</th><th>Status</th><th>Pipeline stage</th><th>Candidate</th><th>Score</th><th>Processed</th><th className="align-right">Action</th></tr></thead><tbody>{files.map((file) => { const profileHref = file.candidateId ? `/candidates/${encodeURIComponent(file.candidateId)}/profile${jobId ? `?jobId=${encodeURIComponent(jobId)}` : ""}` : null; return <tr key={file.id}><td><span className="failure-file-name"><FileText size={16} />{file.name}</span></td><td><span className={`failure-category ${file.status.toLowerCase()}`}>{statusLabel(file.status)}</span></td><td className="muted-cell">{pipelineStage(file)}</td><td>{profileHref ? <Link className="table-link" href={profileHref}>{file.candidateName ?? "Unnamed candidate"}<small>Source CV: {file.name}</small></Link> : <span className="muted-cell">{file.status === "completed" ? "Profile pending" : "Not created"}</span>}</td><td>{file.score == null ? "-" : `${file.score}%`}</td><td className="muted-cell">{formatDate(file.processingCompletedAt ?? file.createdAt)}</td><td className="align-right">{profileHref ? <Link className="table-action-link" href={profileHref}>Open profile <ArrowRight size={14} /></Link> : "-"}</td></tr>; })}{files.length === 0 ? <tr><td className="failure-empty" colSpan={7}>No uploaded files match the current search.</td></tr> : null}</tbody></table></div>
  </div>;
}

function ErrorsTab({ failures, allFailures, activeCategory, setActiveCategory, query, setQuery, retryAll, candidateHref }: { failures: ApiBatchFile[]; allFailures: ApiBatchFile[]; activeCategory: ErrorCategory | "All"; setActiveCategory: (value: ErrorCategory | "All") => void; query: string; setQuery: (value: string) => void; retryAll: () => void; candidateHref: string }) {
  if (!allFailures.length) return <section className="failure-alternate-panel"><CheckCircle2 size={24} /><div><h2>No failed files</h2><p>Every file in this batch completed successfully. The candidate profiles are ready for review.</p><Link className="button primary" href={candidateHref}>View batch candidates <ArrowRight size={14} /></Link></div></section>;
  return <div className="failure-recovery-content">
    <div className="failure-category-grid">{failureCategories.map((category) => { const count = allFailures.filter((file) => failureCategory(file) === category).length; return <button className={activeCategory === category ? "selected" : ""} type="button" key={category} onClick={() => setActiveCategory(activeCategory === category ? "All" : category)}><span><AlertTriangle size={17} /><strong>{count}</strong></span><small>{category}</small></button>; })}</div>
    <div className="failure-action-bar"><div className="failure-search"><Search size={15} /><input placeholder="Search failed files..." value={query} onChange={(event) => setQuery(event.target.value)} /></div><div className="failure-action-buttons"><button className="button primary" type="button" onClick={retryAll}><RefreshCw size={14} />Retry all failures</button></div></div>
    <div className="failure-table-wrap"><table className="failure-table"><thead><tr><th>File name</th><th>Error category</th><th>Stage</th><th>Error message</th><th>Attempts</th></tr></thead><tbody>{failures.map((file) => <tr className="critical" key={file.id}><td><span className="failure-file-name"><FileText size={16} />{file.name}</span></td><td><span className="failure-category ocr-failure">{failureCategory(file)}</span></td><td className="muted-cell">{pipelineStage(file)}</td><td className="failure-message">{file.errorMessage ?? "Processing failed without an additional message."}</td><td>{file.attemptCount}</td></tr>)}{failures.length === 0 ? <tr><td className="failure-empty" colSpan={5}>No failed files match the current filter.</td></tr> : null}</tbody></table></div>
  </div>;
}

function SummaryTab({ batch, candidateHref }: { batch: ApiBatch | null; candidateHref: string }) {
  const profiles = batch?.files?.filter((file) => file.candidateId).length ?? 0;
  return <section className="failure-alternate-panel"><CheckCircle2 size={24} /><div><h2>Batch summary</h2><p>{batch ? `${batch.processedFiles} of ${batch.totalFiles} uploaded file${batch.totalFiles === 1 ? "" : "s"} processed successfully. ${profiles} candidate profile${profiles === 1 ? "" : "s"} can be reviewed.` : "Loading batch summary..."}</p><div><Link className="button primary" href={candidateHref}>View batch candidates <ArrowRight size={14} /></Link><Link className="button" href={batch ? `/batches/processing/${batch.id}` : "/batches"}>Open processing monitor</Link></div></div></section>;
}

function ProcessingLogTab({ batch, files }: { batch: ApiBatch | null; files: ApiBatchFile[] }) {
  const completed = files.filter((file) => file.status === "completed").length;
  const failed = files.filter((file) => file.status === "failed").length;
  return <section className="failure-log-panel"><header><History size={17} /><h2>Processing log</h2></header><div><p><strong>{formatDate(batch?.completedAt ?? batch?.createdAt)}</strong> {batch?.status === "completed" ? `Batch completed: ${completed} CV${completed === 1 ? "" : "s"} processed successfully.` : `Current batch status: ${statusLabel(batch?.status ?? "queued")}.`}</p>{failed ? <p><strong>Attention</strong> {failed} file{failed === 1 ? "" : "s"} failed and can be retried from the Errors tab.</p> : null}<p><strong>{formatDate(batch?.createdAt)}</strong> Upload accepted {batch?.totalFiles ?? 0} file{batch?.totalFiles === 1 ? "" : "s"} for this batch.</p></div></section>;
}

function ChevronRightIcon() {
  return <span className="failure-recovery-chevron" aria-hidden="true">/</span>;
}

function Metric({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return <div className={tone}><span>{label}</span><strong>{value}</strong></div>;
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusTone(status: string) {
  if (status === "completed") return "success";
  if (status === "failed" || status === "partially_completed") return "danger";
  if (status === "cancelled") return "muted";
  return "processing";
}

function pipelineStage(file: ApiBatchFile) {
  if (file.status === "completed") return "Complete";
  if (file.status === "failed") return "Processing failed";
  if (file.status === "scoring") return "Scoring";
  if (file.status === "parsed") return "AI extraction";
  if (file.status === "parsing") return "Text extraction";
  if (file.status === "duplicate") return "Duplicate check";
  return "Queued";
}

function failureCategory(file: ApiBatchFile): ErrorCategory {
  const code = `${file.errorCode ?? ""} ${file.errorMessage ?? ""}`.toLowerCase();
  if (code.includes("format")) return "Unsupported format";
  if (code.includes("ocr")) return "OCR failure";
  if (code.includes("password")) return "Password protected";
  if (code.includes("timeout") || code.includes("rate")) return "AI timeout";
  return "Processing failure";
}

function processingDuration(batch: ApiBatch | null) {
  if (!batch?.startedAt || !batch.completedAt) return "-";
  const milliseconds = new Date(batch.completedAt).getTime() - new Date(batch.startedAt).getTime();
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return "-";
  const seconds = Math.round(milliseconds / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "-";
}

function csvValue(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}
