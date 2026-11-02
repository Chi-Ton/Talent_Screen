"use client";

import Link from "next/link";
import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CloudUpload,
  File,
  FileText,
  FolderOpen,
  Info,
  ShieldCheck,
  Trash2,
  Upload,
  XCircle
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ApiError } from "@/lib/api-client";
import { fetchJobs, type ApiJob } from "@/features/jobs/jobs-api";
import { startBatchProcessing, uploadBatch } from "@/features/batches/screening-api";

type QueueStatus = "valid" | "duplicate" | "unsupported" | "too-large";

type QueueFile = {
  id: string;
  name: string;
  type: string;
  size: string;
  status: QueueStatus;
  progress: number;
  file: File;
};

const statusLabels: Record<QueueStatus, string> = {
  valid: "Valid",
  duplicate: "Duplicate detected",
  unsupported: "Unsupported format",
  "too-large": "File too large"
};

const statusIcons: Record<QueueStatus, typeof Check> = {
  valid: Check,
  duplicate: AlertTriangle,
  unsupported: XCircle,
  "too-large": AlertTriangle
};

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + "KB";
  return (bytes / (1024 * 1024)).toFixed(1) + "MB";
}

function fileType(file: File) {
  return file.name.split(".").pop()?.toUpperCase() || "FILE";
}

function validateFile(file: File, index: number): QueueFile {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const supported = ["pdf", "docx", "txt"].includes(extension || "");
  const tooLarge = file.size > 10 * 1024 * 1024;
  const status: QueueStatus = tooLarge ? "too-large" : !supported ? "unsupported" : "valid";

  return {
    id: `${file.name}-${file.size}-${file.lastModified}-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
    name: file.name,
    type: fileType(file),
    size: formatSize(file.size),
    status,
    progress: status === "unsupported" || status === "too-large" ? 0 : 100,
    file
  };
}

export function UploadCvBatch({ jobId: selectedJobId }: { jobId?: string }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [batchName, setBatchName] = useState("CV evaluation");
  const [queue, setQueue] = useState<QueueFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [starting, setStarting] = useState(false);
  const [jobs, setJobs] = useState<ApiJob[]>([]);
  const [loadError, setLoadError] = useState("");
  const [activeJobId, setActiveJobId] = useState(selectedJobId ?? "");
  const job = jobs.find((item) => item.id === activeJobId);

  useEffect(() => {
    fetchJobs()
      .then((data) => {
        setJobs(data);
        if (selectedJobId && data.some((item) => item.id === selectedJobId)) {
          setActiveJobId(selectedJobId);
        } else if (data.length > 0) {
          setActiveJobId((current) => {
            if (current && data.some((item) => item.id === current)) return current;
            const firstActive = data.find((item) => item.status === "active" || item.status === "paused") ?? data[0];
            return firstActive ? firstActive.id : "";
          });
        }
      })
      .catch((error) => setLoadError(error instanceof ApiError ? error.message : "Unable to load job openings."));
  }, [selectedJobId]);

  const stats = useMemo(() => ({
    valid: queue.filter((file) => file.status === "valid").length,
    duplicate: queue.filter((file) => file.status === "duplicate").length,
    unsupported: queue.filter((file) => file.status === "unsupported").length,
    tooLarge: queue.filter((file) => file.status === "too-large").length,
    total: queue.length
  }), [queue]);

  function addFiles(files: FileList | File[]) {
    const fileArray = Array.from(files);
    if (!fileArray.length) return;
    setQueue((current) => {
      const known = new Set(current.map((item) => `${item.file.name}:${item.file.size}`));
      return [...current, ...fileArray.map(validateFile).map((item) => {
        const signature = `${item.file.name}:${item.file.size}`;
        if (known.has(signature) && item.status === "valid") return { ...item, status: "duplicate" as const };
        known.add(signature);
        return item;
      })];
    });
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files ? Array.from(event.target.files) : [];
    event.target.value = "";
    if (files.length) addFiles(files);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    if (!dragging) setDragging(true);
  }

  function handleDragEnter(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDragging(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget === event.target || !event.currentTarget.contains(event.relatedTarget as Node)) {
      setDragging(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDragging(false);
    const files = event.dataTransfer?.files ? Array.from(event.dataTransfer.files) : [];
    if (files.length > 0) {
      addFiles(files);
    }
  }

  function handleDropzoneClick(event: React.MouseEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button, select, input, a, label")) {
      return;
    }
    fileInput.current?.click();
  }

  function removeFile(id: string) {
    setQueue((current) => current.filter((file) => file.id !== id));
  }

  async function startScreening() {
    if (!activeJobId || stats.valid === 0 || starting) return;
    setStarting(true);
    setLoadError("");
    try {
      const batch = await uploadBatch(activeJobId, queue.filter((file) => file.status === "valid").map((file) => file.file), batchName);
      await startBatchProcessing(batch.id);
      router.push("/batches/processing/" + batch.id);
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : "Unable to upload this batch.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <AppShell activePath="/screen" breadcrumb="CV Screening / Upload & Evaluate">
      <div className="upload-page">
        {loadError ? <div className="inline-error" role="alert">{loadError}</div> : null}
        <div className="upload-warning"><ShieldCheck size={14} aria-hidden="true" />Privacy protection is mandatory: direct identity and contact data are removed locally before remote AI analysis.</div>

        <section className="upload-context-strip">
          <div>
            <h1><FileText size={17} aria-hidden="true" />Evaluate CVs for: {job?.title ?? "Select a target role"}</h1>
            <div className="upload-context-meta">
              <span><Info size={14} aria-hidden="true" />Scores use the selected role criteria</span>
              <span><File size={14} aria-hidden="true" />Accepted: PDF, DOCX, TXT</span>
              <span><ShieldCheck size={14} aria-hidden="true" />PII-redacted AI request</span>
            </div>
          </div>
          <Link className="upload-job-link" href="/jobs">Manage role criteria <ArrowRight size={14} /></Link>
        </section>

        <div className="upload-config-grid">
          <section
            className={"upload-dropzone " + (dragging ? "is-dragging" : "")}
            style={{ cursor: "pointer" }}
            onClick={handleDropzoneClick}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="upload-cloud-icon" style={{ pointerEvents: "none" }}><CloudUpload size={30} aria-hidden="true" /></div>
            <h2 style={{ pointerEvents: "none" }}>Drag and drop resumes here</h2>
            <p style={{ pointerEvents: "none" }}>Select CVs from this computer. The system extracts evidence, evaluates every CV with the same rubric, then ranks the results.</p>
            <div className="upload-picker-actions">
              <label className="button primary" htmlFor="cv-file-picker-input" style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <Upload size={15} aria-hidden="true" />
                Browse files
              </label>
              <label className="button" htmlFor="cv-folder-picker-input" style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <FolderOpen size={15} aria-hidden="true" />
                Select folder
              </label>
            </div>
            <input
              id="cv-file-picker-input"
              ref={fileInput}
              style={{ position: "absolute", opacity: 0, width: "1px", height: "1px", pointerEvents: "none" }}
              type="file"
              accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              multiple
              onChange={handleFileChange}
            />
            <input
              id="cv-folder-picker-input"
              ref={(node) => {
                folderInput.current = node;
                if (node) {
                  node.setAttribute("webkitdirectory", "");
                  node.setAttribute("directory", "");
                }
              }}
              style={{ position: "absolute", opacity: 0, width: "1px", height: "1px", pointerEvents: "none" }}
              type="file"
              multiple
              onChange={handleFileChange}
            />
            <label className="upload-native-picker" onClick={(e) => e.stopPropagation()}>
              <span>Native file picker fallback</span>
              <input
                type="file"
                accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                multiple
                onChange={handleFileChange}
              />
            </label>
            <span className="upload-dropzone-note" style={{ pointerEvents: "none" }}>PDF, DOCX or TXT up to 10MB each</span>
          </section>

          <section className="upload-config-panel">
            <h2>Evaluation Setup</h2>
            <label className="upload-field">
              <span>Target Role</span>
              <select value={activeJobId} onChange={(event) => setActiveJobId(event.target.value)}>
                <option value="">Select target role...</option>
                {jobs
                  .filter((item) => item.status === "active" || item.status === "paused")
                  .map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
              </select>
            </label>
            <label className="upload-field">
              <span>Evaluation Name</span>
              <input value={batchName} onChange={(event) => setBatchName(event.target.value)} />
            </label>
            <div className="upload-switch-row">
              <div><strong><ShieldCheck size={14} aria-hidden="true" />Private screening enforced</strong><small>Names and contact details stay local; AI receives only redacted evidence.</small></div>
              <span className="upload-validation valid"><Check size={13} aria-hidden="true" />Always on</span>
            </div>
          </section>
        </div>

        <section className="upload-queue-card">
          <header className="upload-queue-header">
            <h2>Upload Queue</h2>
            <div className="upload-stats">
              <span className="valid"><i />Valid: {stats.valid}</span>
              <span className="duplicate"><i />Duplicate: {stats.duplicate}</span>
              <span className="unsupported"><i />Unsupported: {stats.unsupported}</span>
              <span className="too-large"><i />Too Large: {stats.tooLarge}</span>
              <strong>Total: {stats.total}</strong>
            </div>
          </header>
          <div className="upload-table-wrap">
            <table className="upload-table">
              <thead><tr><th>File Name</th><th>Type</th><th>Size</th><th>Validation Status</th><th>Progress</th><th className="align-right">Action</th></tr></thead>
              <tbody>
                {queue.map((file) => {
                  const StatusIcon = statusIcons[file.status];
                  return <tr className={file.status} key={file.id}>
                    <td><span className="upload-file-name"><FileText size={17} aria-hidden="true" />{file.name}</span></td>
                    <td>{file.type}</td>
                    <td>{file.size}</td>
                    <td><span className={"upload-validation " + file.status}><StatusIcon size={13} aria-hidden="true" />{statusLabels[file.status]}</span></td>
                    <td><div className="upload-progress"><span><i style={{ width: file.progress + "%" }} /></span><small>{file.progress}%</small></div></td>
                    <td className="align-right"><button className="upload-delete" type="button" aria-label={"Remove " + file.name} onClick={() => removeFile(file.id)}><Trash2 size={16} /></button></td>
                  </tr>;
                })}
                {queue.length === 0 ? <tr><td className="upload-empty" colSpan={6}>No files in the upload queue.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <footer className="upload-footer">
        <Link className="button" href="/results"><XCircle size={15} aria-hidden="true" />Cancel</Link>
        <div>
          <button className="button primary" type="button" disabled={stats.valid === 0 || starting || !activeJobId} onClick={startScreening}>{!activeJobId ? "Select a target role" : starting ? "Evaluating..." : "Evaluate " + stats.valid + " CV" + (stats.valid === 1 ? "" : "s")}<ArrowRight size={16} aria-hidden="true" /></button>
        </div>
      </footer>
    </AppShell>
  );
}
