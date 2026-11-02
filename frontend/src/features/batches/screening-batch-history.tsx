"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Archive,
  ArrowDownUp,
  Bookmark,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileWarning,
  MoreVertical,
  RefreshCw,
  Search,
  Upload,
  X
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ApiError } from "@/lib/api-client";
import { fetchBatches, retryBatchFailures, type ApiBatch } from "@/features/batches/screening-api";
import { fetchJobs, type ApiJob } from "@/features/jobs/jobs-api";

type BatchStatus = "Running" | "Completed" | "Partial / Failed";

type Batch = {
  id: string;
  name: string;
  job: string;
  jobId: string;
  files: number;
  done: number;
  fail: number;
  score: string;
  status: BatchStatus;
  started: string;
  duration: string;
  owner: string;
};

function toBatchRow(batch: ApiBatch, jobs: ApiJob[]): Batch {
  const job = jobs.find((item) => item.id === batch.jobId);
  const status: BatchStatus = batch.status === "completed" ? "Completed" : batch.status === "processing" || batch.status === "queued" ? "Running" : "Partial / Failed";
  return {
    id: batch.id,
    name: batch.name,
    job: job?.title ?? batch.jobId,
    jobId: batch.jobId,
    files: batch.totalFiles,
    done: batch.processedFiles,
    fail: batch.failedFiles,
    score: "-",
    status,
    started: new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(batch.createdAt)),
    duration: "-",
    owner: batch.ownerName ?? "Unassigned"
  };
}

export function ScreeningBatchHistory() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [jobFilter, setJobFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [ownerFilter, setOwnerFilter] = useState("All");
  const [dateFilter, setDateFilter] = useState("Last 30 Days");
  const [sortDescending, setSortDescending] = useState(true);
  const [savedView, setSavedView] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    Promise.all([fetchBatches(), fetchJobs()])
      .then(([batchData, jobs]) => setBatches(batchData.map((batch) => toBatchRow(batch, jobs))))
      .catch((error) => setLoadError(error instanceof ApiError ? error.message : "Unable to load screening batches."))
      .finally(() => setIsLoading(false));
  }, []);

  const filteredBatches = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const result = batches.filter((batch) => {
      const searchable = (batch.id + " " + batch.name + " " + batch.job).toLowerCase();
      return (!normalizedQuery || searchable.includes(normalizedQuery))
        && (jobFilter === "All" || batch.job === jobFilter)
        && (statusFilter === "All" || batch.status === statusFilter)
        && (ownerFilter === "All" || batch.owner === ownerFilter);
    });
    return result.sort((a, b) => sortDescending ? b.id.localeCompare(a.id) : a.id.localeCompare(b.id));
  }, [batches, jobFilter, ownerFilter, query, sortDescending, statusFilter]);

  const pageSize = 10;
  const totalCount = filteredBatches.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const visibleBatches = filteredBatches.slice((page - 1) * pageSize, page * pageSize);
  const visibleIds = visibleBatches.map((batch) => batch.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));

  function updateFilter(setter: (value: string) => void, value: string) {
    setter(value);
    setPage(1);
  }

  function toggleAllVisible() {
    setSelected((current) => allVisibleSelected
      ? current.filter((id) => !visibleIds.includes(id))
      : [...new Set([...current, ...visibleIds])]);
  }

  function toggleBatch(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function retryFailures(id: string) {
    try {
      const result = await retryBatchFailures(id);
      setBatches((current) => current.map((batch) => batch.id === id && result.retriedFiles > 0
        ? { ...batch, status: "Running", fail: 0 }
        : batch));
      setNotice(result.retriedFiles > 0 ? id + " retry started." : id + " has no failed file records to retry.");
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : "Retry failed.");
    } finally {
      setOpenMenu(null);
    }
  }

  function archiveBatch(id: string) {
    setBatches((current) => current.filter((batch) => batch.id !== id));
    setOpenMenu(null);
    setNotice(id + " archived.");
  }

  function clearFilters() {
    setQuery("");
    setJobFilter("All");
    setStatusFilter("All");
    setOwnerFilter("All");
    setDateFilter("Last 30 Days");
    setPage(1);
  }

  return (
    <AppShell activePath="/batches" breadcrumb="Recruitment / Screening Batches" searchValue={query} onSearchChange={(value) => updateFilter(setQuery, value)}>
      <div className="batch-history-page">
        <header className="batch-history-header">
          <div><h1 className="page-title">Screening Batches</h1><p className="page-subtitle">Monitor upload history, processing quality and candidate scoring results.</p></div>
          <Link className="button primary" href="/batches/upload"><Upload size={15} aria-hidden="true" />Upload new batch</Link>
        </header>

        <section className="batch-history-kpis" aria-label="Batch summary">
          <div><span>Running</span><strong className="primary-value">{batches.filter((batch) => batch.status === "Running").length}</strong></div>
          <div><span>Completed</span><strong>{batches.filter((batch) => batch.status === "Completed").length}</strong></div>
          <div><span>Partial / Failed</span><strong className="danger-value">{batches.filter((batch) => batch.status === "Partial / Failed").length}</strong></div>
          <div><span>CVs Processed</span><strong>{batches.reduce((sum, batch) => sum + batch.done, 0).toLocaleString("en-US")}</strong></div>
        </section>

        <section className="batch-history-card">
          <div className="batch-history-filter-bar">
            <div className="batch-history-filters">
              <label className="batch-history-search"><Search size={15} aria-hidden="true" /><span className="sr-only">Search batch ID or name</span><input placeholder="Search batch ID or name..." value={query} onChange={(event) => updateFilter(setQuery, event.target.value)} /></label>
              <label><span className="sr-only">Job opening</span><select value={jobFilter} onChange={(event) => updateFilter(setJobFilter, event.target.value)}><option value="All">Job Opening: All</option>{[...new Set(batches.map((batch) => batch.job))].map((job) => <option key={job} value={job}>{job}</option>)}</select></label>
              <label><span className="sr-only">Status</span><select value={statusFilter} onChange={(event) => updateFilter(setStatusFilter, event.target.value)}><option value="All">Status: All</option><option>Running</option><option>Completed</option><option>Partial / Failed</option></select></label>
              <label className="batch-owner-filter"><span className="sr-only">Owner</span><select value={ownerFilter} onChange={(event) => updateFilter(setOwnerFilter, event.target.value)}><option value="All">Owner: All</option>{[...new Set(batches.map((batch) => batch.owner))].map((owner) => <option key={owner}>{owner}</option>)}</select></label>
              <button className="batch-date-button" type="button" onClick={() => setDateFilter((current) => current === "Last 30 Days" ? "All Time" : "Last 30 Days")}><CalendarDays size={14} aria-hidden="true" />{dateFilter}</button>
              {(query || jobFilter !== "All" || statusFilter !== "All" || ownerFilter !== "All") ? <button className="batch-clear-button" type="button" onClick={clearFilters}><X size={14} />Clear</button> : null}
            </div>
            <div className="batch-history-tools"><button className={"batch-tool-button " + (savedView ? "selected" : "")} type="button" onClick={() => setSavedView((current) => !current)}><Bookmark size={14} aria-hidden="true" />{savedView ? "Saved" : "Saved Views"}</button><button className="batch-tool-button" type="button" onClick={() => setSortDescending((current) => !current)}><ArrowDownUp size={14} aria-hidden="true" />Sort</button></div>
          </div>

          {selected.length > 0 ? <div className="batch-selection-bar"><strong>{selected.length} selected</strong><button type="button" onClick={() => { setSelected([]); setNotice("Selected batches archived."); }}>Archive selected</button><button type="button" onClick={() => setSelected([])}>Clear selection</button></div> : null}
          {notice ? <div className="batch-history-notice" role="status">{notice}<button type="button" aria-label="Dismiss notice" onClick={() => setNotice("")}><X size={14} /></button></div> : null}

          <div className="batch-history-table-wrap">
            <table className="batch-history-table">
              <thead><tr><th className="batch-check-cell"><input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} aria-label="Select all visible batches" /></th><th>Batch ID</th><th>Batch Name</th><th>Job Opening</th><th className="number-cell">Files</th><th className="number-cell">Done</th><th className="number-cell">Fail</th><th className="number-cell">Avg Score</th><th>Status</th><th>Started</th><th>Owner</th><th className="batch-action-cell">Actions</th></tr></thead>
              <tbody>
                {isLoading ? <tr><td className="batch-history-empty" colSpan={12}>Loading connected batches...</td></tr> : null}
                {visibleBatches.map((batch) => <tr className={batch.status === "Partial / Failed" ? "has-errors" : ""} key={batch.id}>
                  <td className="batch-check-cell"><input type="checkbox" checked={selected.includes(batch.id)} onChange={() => toggleBatch(batch.id)} aria-label={"Select " + batch.id} /></td>
                  <td className="batch-id-cell"><Link href={"/batches/" + batch.id}>{batch.id}</Link></td>
                  <td className="batch-name-cell">{batch.name}</td><td className="muted-cell">{batch.job}</td><td className="number-cell">{batch.files}</td><td className="number-cell">{batch.done}</td><td className={"number-cell " + (batch.fail > 0 ? "fail-number" : "")}>{batch.fail}</td><td className="number-cell">{batch.score}</td>
                  <td><BatchStatusBadge batch={batch} /></td><td className="muted-cell batch-started-cell">{batch.started}<small>Duration: {batch.duration}</small></td><td className="muted-cell">{batch.owner}</td>
                  <td className="batch-action-cell"><div className="batch-row-menu"><button type="button" aria-label={"More actions for " + batch.id} onClick={() => setOpenMenu((current) => current === batch.id ? null : batch.id)}><MoreVertical size={17} /></button>{openMenu === batch.id ? <div className="batch-action-menu"><Link href={"/batches/" + batch.id}>Open</Link><Link href={"/candidates/ranked?jobId=" + batch.jobId + "&batchId=" + batch.id}>View candidates</Link><Link href={"/reports/" + batch.jobId}>View report</Link>{batch.fail > 0 ? <button type="button" onClick={() => retryFailures(batch.id)}><RefreshCw size={14} />Retry failures</button> : null}<button type="button" onClick={() => setNotice("Error list for " + batch.id + " is ready to download.")}><FileWarning size={14} />Download error list</button><button type="button" onClick={() => archiveBatch(batch.id)}><Archive size={14} />Archive</button></div> : null}</div></td>
                </tr>)}
                {!isLoading && visibleBatches.length === 0 ? <tr><td className="batch-history-empty" colSpan={12}>No batches match the current filters. <button type="button" onClick={clearFilters}>Clear filters</button></td></tr> : null}
              </tbody>
            </table>
          </div>

          <footer className="batch-history-pagination"><span>Showing <strong>{filteredBatches.length ? (page - 1) * pageSize + 1 : 0}-{Math.min(page * pageSize, Math.max(filteredBatches.length, (page - 1) * pageSize))}</strong> of <strong>{totalCount}</strong> batches</span><div><button type="button" disabled={page === 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeft size={15} aria-hidden="true" />Previous</button><button className={page === 1 ? "active" : ""} type="button" onClick={() => setPage(1)}>1</button><button className={page === 2 ? "active" : ""} type="button" onClick={() => setPage(2)}>2</button><button className={page === 3 ? "active" : ""} type="button" onClick={() => setPage(3)}>3</button><span>...</span><button className={page === pageCount ? "active" : ""} type="button" onClick={() => setPage(pageCount)}>{pageCount}</button><button type="button" disabled={page === pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>Next<ChevronRight size={15} aria-hidden="true" /></button></div></footer>
        </section>
      </div>
    </AppShell>
  );
}

function BatchStatusBadge({ batch }: { batch: Batch }) {
  const Icon = batch.status === "Running" ? Clock3 : batch.status === "Completed" ? CheckCircle2 : AlertTriangle;
  return <span className={"batch-history-status " + (batch.status === "Running" ? "running" : batch.status === "Completed" ? "completed" : "failed")}><Icon size={12} aria-hidden="true" />{batch.status}</span>;
}
