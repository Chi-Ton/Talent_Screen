"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  History,
  RefreshCw,
  Search
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ApiError } from "@/lib/api-client";
import { fetchBatch, retryBatchFailures, type ApiBatch, type ApiBatchFile } from "@/features/batches/screening-api";

type ProcessingStatus = "Processing" | "Completed" | "Failed";

type ProcessingFile = {
  id: string;
  name: string;
  stage: string;
  progress: number;
  duration: string;
  status: ProcessingStatus;
  error?: string;
};

const stages = ["Upload", "Text Extraction", "PII Anonymization", "AI Extraction", "Semantic Matching", "Scoring", "Complete"];
const stageIndexes: Record<string, number> = { Upload: 0, "Text Extraction": 1, "PII Anonymization": 2, "AI Profile Extraction": 3, "Semantic Matching": 4, Scoring: 5, Complete: 6 };

function toProcessingFile(file: ApiBatchFile): ProcessingFile {
  const status = file.status.toLowerCase();
  const isFailed = status === "failed";
  const isComplete = status === "completed";
  return { id: file.id, name: file.name, stage: isComplete ? "Complete" : isFailed ? "Text Extraction" : status === "scoring" ? "Scoring" : status === "parsing" ? "AI Profile Extraction" : "Upload", progress: isComplete ? 100 : status === "parsing" ? Math.max(file.progress, 65) : file.progress, duration: isComplete ? "Complete" : "-", status: isFailed ? "Failed" : isComplete ? "Completed" : "Processing", error: file.errorMessage ?? undefined };
}

function buildProcessingEvents(batch: ApiBatch | null, files: ProcessingFile[]) {
  if (!batch) return [];
  const failedFiles = files.filter((file) => file.status === "Failed");
  const events: { time: string; tone: string; text: string }[] = [];
  const time = new Date(batch.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  if (batch.status === "completed") {
    events.push({ time, tone: "primary", text: `Evaluation completed. ${batch.processedFiles} CVs were processed successfully.` });
  } else if (batch.status === "failed" || batch.status === "partially_completed") {
    events.push({ time, tone: "error", text: `Evaluation finished with ${batch.failedFiles} failed CV${batch.failedFiles === 1 ? "" : "s"}.` });
  } else {
    const activeFiles = files.filter((file) => file.status === "Processing").length;
    events.push({ time, tone: "primary", text: `AI is evaluating ${activeFiles} CV${activeFiles === 1 ? "" : "s"}.` });
  }

  if (failedFiles.length > 0) {
    events.push({ time, tone: "error", text: `${failedFiles.length} CV${failedFiles.length === 1 ? "" : "s"} failed and can be retried.` });
  }
  events.push({ time, tone: "muted", text: `Upload accepted ${batch.totalFiles} CV${batch.totalFiles === 1 ? "" : "s"} for this batch.` });
  return events;
}

export function BatchProcessingMonitor({ batchId = "BAT-001" }: { batchId?: string }) {
  const [batch, setBatch] = useState<ApiBatch | null>(null);
  const [loadError, setLoadError] = useState("");
  const [status, setStatus] = useState<"Processing" | "Completed" | "Failed" | "Cancelled">("Processing");
  const [files, setFiles] = useState<ProcessingFile[]>([]);
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("All Stages");
  const [statusFilter, setStatusFilter] = useState("All Status");
  const [expanded, setExpanded] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    const loadBatch = () => fetchBatch(batchId).then((value) => {
      if (!active) return;
      setBatch(value);
      setFiles((value.files ?? []).map(toProcessingFile));
      setStatus(value.status === "cancelled" ? "Cancelled" : value.status === "completed" ? "Completed" : value.status === "failed" || value.status === "partially_completed" ? "Failed" : "Processing");
    }).catch((error: unknown) => {
      if (active) setLoadError(error instanceof ApiError ? error.message : "Unable to load the processing batch.");
    });
    loadBatch();
    const timer = window.setInterval(loadBatch, 4000);
    return () => { active = false; window.clearInterval(timer); };
  }, [batchId]);

  const filteredFiles = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return files.filter((file) => {
      return (!normalized || file.name.toLowerCase().includes(normalized))
        && (stageFilter === "All Stages" || file.stage === stageFilter)
        && (statusFilter === "All Status" || file.status === statusFilter);
    });
  }, [files, query, stageFilter, statusFilter]);

  const events = useMemo(() => buildProcessingEvents(batch, files), [batch, files]);
  const isComplete = status === "Completed";
  const currentStage = isComplete ? stages.length - 1 : Math.max(0, ...files.map((file) => stageIndexes[file.stage] ?? 0));

  function toggleExpanded(id: string) {
    setExpanded((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function retryFailures() {
    try {
      const result = await retryBatchFailures(batchId);
      setStatus("Processing");
      setBatch((current) => current ? { ...current, ...result } : result);
      setFiles((current) => current.map((file) => file.status === "Failed"
        ? { ...file, stage: "Upload", progress: 0, duration: "-", status: "Processing", error: undefined }
        : file));
      setLoadError("");
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : "Unable to retry failed CVs.");
    }
  }

  const displayStatus = status;

  return (
    <AppShell activePath="/screen" breadcrumb="CV Screening / Evaluation Progress">
      <div className="processing-page">
        <main className="processing-main">
          <div className="processing-breadcrumb"><Link href="/screen">Upload &amp; Evaluate</Link><ChevronRight size={14} aria-hidden="true" /><strong>Evaluation progress</strong></div>
          <div className="processing-heading">
            <div className="processing-title-line"><h1 className="page-title">{batch?.name ?? batchId}</h1><span className={"processing-status " + displayStatus.toLowerCase()}><i />{displayStatus}</span></div>
            <div className="processing-actions">
              {status === "Failed" && files.some((file) => file.status === "Failed") ? <button className="button primary" type="button" onClick={retryFailures}><RefreshCw size={15} aria-hidden="true" />Retry failed CVs</button> : null}
              {isComplete ? <Link className="button primary" href={`/results?batchId=${encodeURIComponent(batchId)}`}>View ranked results <ArrowRight size={15} aria-hidden="true" /></Link> : <span className="muted-cell">This page refreshes automatically.</span>}
            </div>
          </div>

          <section className="processing-metadata">
            <div><span>Target Role</span><strong>{batch?.jobTitle ?? "Selected role"}</strong></div><i /><div><span>CV Files</span><strong>{batch?.totalFiles ?? 0}</strong></div><i /><div><span>Started</span><strong>{batch?.createdAt ? new Date(batch.createdAt).toLocaleString() : "-"}</strong></div><i /><div><span>Completed</span><strong>{batch ? `${batch.processedFiles} of ${batch.totalFiles}` : "-"}</strong></div><i /><div><span>State</span><strong>{batch ? isComplete ? "Ready for review" : status === "Failed" ? "Needs attention" : "Processing" : "-"}</strong></div>
          </section>

          {loadError ? <div className="processing-empty" role="alert">{loadError}</div> : null}

          <section className="processing-progress-card">
            <header className="processing-progress-header">
              <div><h2>{batch?.totalFiles ?? 0} Total CVs</h2><div className="processing-legend"><span className="completed"><i />{batch?.processedFiles ?? 0} Completed</span><span className="active"><i />{Math.max(0, (batch?.totalFiles ?? 0) - (batch?.processedFiles ?? 0) - (batch?.failedFiles ?? 0))} Processing</span><span className="queued"><i />{files.filter((file) => file.status === "Processing" && file.progress === 0).length} Queued</span><span className="failed"><i />{batch?.failedFiles ?? 0} Failed</span></div></div>
              <div className="processing-rate"><span>Progress</span><strong>{isComplete ? "Complete" : "Live"}</strong><small>{isComplete ? "All files processed" : "Time depends on document length and provider capacity"}</small></div>
            </header>
            <div className="overall-progress"><div><strong>Overall Progress</strong><b>{batch?.totalFiles ? Math.round((batch.processedFiles / batch.totalFiles) * 100) : 0}%</b></div><span><i className="complete-bar" style={{ width: (batch?.totalFiles ? (batch.processedFiles / batch.totalFiles) * 100 : 0) + "%" }} /><i className="active-bar" /><i className="failed-bar" /></span></div>
            <div className="stage-stepper">{stages.map((stage, index) => <div className={"stage-step " + (isComplete || index < currentStage ? "done" : index === currentStage ? "current" : "pending")} key={stage}><span>{isComplete || index < currentStage ? <Check size={13} aria-hidden="true" /> : index === currentStage ? <i /> : null}</span><small>{stage}</small></div>)}</div>
          </section>

          <section className="processing-queue-card">
            <header className="processing-queue-header"><h2>Live Processing Queue</h2><div className="processing-filters"><label><Search size={15} aria-hidden="true" /><input aria-label="Search file name" placeholder="Search file name..." value={query} onChange={(event) => setQuery(event.target.value)} /></label><select aria-label="Filter by stage" value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}><option>All Stages</option>{stages.slice(1, -1).map((stage) => <option key={stage}>{stage}</option>)}</select><select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>All Status</option><option>Processing</option><option>Completed</option><option>Failed</option></select></div></header>
            <div className="processing-table-wrap"><table className="processing-table"><thead><tr><th>File Name</th><th>Current Stage</th><th>Progress</th><th>Duration</th><th>Status</th><th className="align-right">Action</th></tr></thead><tbody>{filteredFiles.map((file) => <tr className={file.status.toLowerCase()} key={file.id}><td><span className="processing-file-name"><FileText size={16} aria-hidden="true" />{file.name}</span></td><td>{file.stage}</td><td><div className="processing-file-progress"><span><i style={{ width: file.progress + "%" }} /></span><small>{file.progress}%</small></div></td><td className="muted-cell">{file.duration}</td><td><span className={"processing-file-status " + file.status.toLowerCase()}>{file.status}</span></td><td className="align-right"><div className="processing-row-actions"><button className="icon-link" type="button" aria-label={"Toggle details for " + file.name} onClick={() => toggleExpanded(file.id)}>{expanded.includes(file.id) ? <ChevronDown size={17} /> : <ChevronRight size={17} />}</button></div></td></tr>)}{filteredFiles.map((file) => expanded.includes(file.id) ? <tr className="processing-detail-row" key={file.id + "-detail"}><td colSpan={6}><strong>{file.name}</strong>{file.error ? <span className="processing-error-detail"><AlertTriangle size={14} />{file.error}</span> : <span>Pipeline telemetry: {file.stage} is {file.progress}% complete. Candidate profile will be scored after semantic matching.</span>}</td></tr> : null)}{filteredFiles.length === 0 ? <tr><td className="processing-empty" colSpan={6}>No files match the current filters.</td></tr> : null}</tbody></table></div>
          </section>
        </main>

        <aside className="processing-events-card"><header><History size={17} aria-hidden="true" /><h2>Processing Events</h2></header><div className="processing-events-list">{events.map((event, index) => <div className={"processing-event " + event.tone} key={`${event.time}-${index}`}><span className="processing-event-dot">{index === 0 ? <CheckCircle2 size={11} /> : null}</span><div><time>{event.time}</time><p>{event.text}</p></div></div>)}</div><Link className="processing-log-link" href={`/batches/${encodeURIComponent(batchId)}`}>View file details <ArrowRight size={14} /></Link></aside>
      </div>
    </AppShell>
  );
}
