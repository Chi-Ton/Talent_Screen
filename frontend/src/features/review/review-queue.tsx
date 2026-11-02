"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUp,
  CheckCircle2,
  ChevronRight,
  Download,
  ExternalLink,
  Filter,
  Inbox,
  MoreVertical,
  Search,
  ShieldAlert,
  UserRound,
  Users,
  X
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ApiError } from "@/lib/api-client";
import { assignReviewItems, fetchReviewQueue, type ApiReviewItem } from "@/features/review/review-api";

type QueueItem = {
  candidateId: string;
  itemId: string;
  jobId: string;
  batchId: string | null;
  sourceName: string;
  score: number;
  job: string;
  reason: string;
  priority: "High" | "Medium" | "Low";
  assigned: string;
  due: string;
  initials: string;
  color: string;
};

export function ReviewQueue() {
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [jobFilter, setJobFilter] = useState("All Jobs");
  const [reasonFilter, setReasonFilter] = useState("Issue Reason");
  const [priorityFilter, setPriorityFilter] = useState("All priorities");
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    let active = true;
    fetchReviewQueue().then((items) => {
      if (active) setQueueItems(items.map(toQueueItem));
    }).catch((error: unknown) => {
      if (active) setLoadError(error instanceof ApiError ? error.message : "Unable to load the review queue.");
    }).finally(() => {
      if (active) setIsLoading(false);
    });
    return () => { active = false; };
  }, []);

  const filteredItems = useMemo(() => queueItems.filter((item) => {
    const matchesQuery = (item.candidateId + " " + item.sourceName + " " + (item.batchId ?? "") + " " + item.job + " " + item.reason).toLowerCase().includes(query.toLowerCase());
    const matchesJob = jobFilter === "All Jobs" || item.job === jobFilter;
    const matchesReason = reasonFilter === "Issue Reason" || item.reason === reasonFilter;
    const matchesPriority = priorityFilter === "All priorities" || item.priority === priorityFilter;
    return matchesQuery && matchesJob && matchesReason && matchesPriority;
  }), [jobFilter, priorityFilter, query, queueItems, reasonFilter]);

  const allVisibleSelected = filteredItems.length > 0 && filteredItems.every((item) => selected.includes(item.itemId));

  function toggleSelected(id: string) {
    setSelected((ids) => ids.includes(id) ? ids.filter((itemId) => itemId !== id) : [...ids, id]);
  }

  function toggleAll() {
    setSelected(allVisibleSelected ? selected.filter((id) => !filteredItems.some((item) => item.itemId === id)) : Array.from(new Set([...selected, ...filteredItems.map((item) => item.itemId)])));
  }

  async function assignSelected() {
    if (!selected.length) {
      setNotice("Select at least one candidate to assign.");
      return;
    }
    try {
      const selectedItems = queueItems.filter((item) => selected.includes(item.itemId));
      const result = await assignReviewItems(selectedItems.map((item) => item.itemId));
      setQueueItems((current) => current.map((item) => selected.includes(item.itemId) ? { ...item, assigned: result.assignedTo, priority: item.priority } : item));
      setNotice(result.assignedCount + " candidate" + (result.assignedCount > 1 ? "s" : "") + " assigned to you.");
      setSelected([]);
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : "Unable to assign the selected candidates.");
    }
  }

  function exportQueue() {
    const rows = ["Candidate,Score,Job,Reason,Priority,Assigned,Due", ...filteredItems.map((item) => [item.candidateId, item.score, item.job, item.reason, item.priority, item.assigned, item.due].map((value) => '"' + value + '"').join(","))];
    const url = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "review-queue.csv";
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice("Review queue exported as CSV.");
  }

  function setQueuePage(nextPage: number) {
    setPage(nextPage);
    setNotice(nextPage === 1 ? "Showing first page." : "Page " + nextPage + " is ready for API pagination.");
  }

  return (
    <AppShell activePath="/review-queue" breadcrumb="Recruitment / Review Queue">
      <div className="review-queue-page">
        <header className="review-queue-header"><div className="review-queue-breadcrumb"><Link href="/dashboard">Recruitment</Link><ChevronRight size={14} /><strong>Review Queue</strong></div><div className="review-queue-title-row"><div><h1>Review Queue</h1><p>Manage candidates requiring manual review before shortlisting.</p></div><div className="review-queue-actions"><button className="button" type="button" onClick={exportQueue}><Download size={14} />Export</button><button className="button primary" type="button" onClick={assignSelected}><Users size={14} />Assign Selected{selected.length ? " (" + selected.length + ")" : ""}</button></div></div></header>
        <section className="review-queue-kpis" aria-label="Review queue summary"><QueueKpi label="Assigned to me" value={String(queueItems.filter((item) => item.assigned !== "Unassigned").length)} icon={<UserRound size={17} />} /><QueueKpi label="Unassigned" value={String(queueItems.filter((item) => item.assigned === "Unassigned").length)} icon={<Inbox size={17} />} /><QueueKpi label="Due today" value={String(queueItems.filter((item) => item.due === "Today").length)} icon={<CheckCircle2 size={17} />} /><QueueKpi label="Overdue" value={String(queueItems.filter((item) => item.due === "Overdue").length)} icon={<AlertTriangle size={17} />} tone="danger" /></section>
        <section className="review-queue-table-card"><div className="review-queue-filter-bar"><div className="review-queue-search"><Search size={15} /><input aria-label="Filter candidates" placeholder="Filter candidates..." value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} /></div><select aria-label="Filter by job" value={jobFilter} onChange={(event) => setJobFilter(event.target.value)}><option>All Jobs</option>{Array.from(new Set(queueItems.map((item) => item.job))).map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Filter by reason" value={reasonFilter} onChange={(event) => setReasonFilter(event.target.value)}><option>Issue Reason</option>{Array.from(new Set(queueItems.map((item) => item.reason))).map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Filter by priority" value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option>All priorities</option>{Array.from(new Set(queueItems.map((item) => item.priority))).map((item) => <option key={item}>{item}</option>)}</select><button className="review-filter-button" type="button" aria-label="Open advanced filters" onClick={() => setNotice("Advanced filters are ready for the review API.")}><Filter size={16} /></button></div>
          <div className="review-queue-table-wrap"><table className="review-queue-table"><thead><tr><th className="review-check-cell"><input aria-label="Select all visible candidates" type="checkbox" checked={allVisibleSelected} onChange={toggleAll} /></th><th>Candidate</th><th>Score</th><th>Job</th><th>Reason</th><th>Priority</th><th>Assigned</th><th>Due</th><th>Actions</th></tr></thead><tbody>{isLoading ? <tr><td className="review-empty-cell" colSpan={9}>Loading review queue...</td></tr> : loadError ? <tr><td className="review-empty-cell" colSpan={9}><strong>{loadError}</strong><span>Check the API server and refresh this page.</span></td></tr> : filteredItems.length ? filteredItems.map((item) => <QueueRow item={item} selected={selected.includes(item.itemId)} onSelect={toggleSelected} onAction={(action) => setNotice(action + " action opened for " + item.candidateId + ".")} key={item.itemId} />) : <tr><td className="review-empty-cell" colSpan={9}><Search size={19} /><strong>No candidates match these filters</strong><span>Try clearing a filter or search term.</span></td></tr>}</tbody></table></div>
          <footer className="review-queue-pagination"><span>Showing <strong>{filteredItems.length ? 1 : 0}</strong> to <strong>{filteredItems.length}</strong> of <strong>{filteredItems.length}</strong> results</span><div><button type="button" aria-label="Previous page" disabled={page === 1} onClick={() => setQueuePage(Math.max(1, page - 1))}><ChevronRight size={15} className="rotate-180" /></button><button className={page === 1 ? "active" : ""} type="button" onClick={() => setQueuePage(1)}>1</button><button className={page === 2 ? "active" : ""} type="button" onClick={() => setQueuePage(2)}>2</button><button className={page === 3 ? "active" : ""} type="button" onClick={() => setQueuePage(3)}>3</button><button type="button" aria-label="Next page" onClick={() => setQueuePage(Math.min(3, page + 1))}><ChevronRight size={15} /></button></div></footer>
        </section>
        {notice ? <div className="review-queue-toast" role="status"><CheckCircle2 size={15} />{notice}<button type="button" aria-label="Dismiss notice" onClick={() => setNotice("")}><X size={14} /></button></div> : null}
      </div>
    </AppShell>
  );
}

function QueueKpi({ label, value, icon, tone = "default" }: { label: string; value: string; icon: React.ReactNode; tone?: string }) {
  return <div className={"review-queue-kpi " + (tone === "danger" ? "danger" : "")}><div><span>{label}</span>{icon}</div><strong>{value}</strong></div>;
}

function toQueueItem(item: ApiReviewItem): QueueItem {
  const priority = item.priority.toLowerCase();
  const due = item.dueAt ? new Date(item.dueAt) : null;
  return {
    candidateId: item.candidateId,
    itemId: item.id,
    jobId: item.jobId,
    batchId: item.batchId,
    sourceName: item.candidateName,
    score: Math.round(item.score),
    job: item.jobTitle,
    reason: item.reason,
    priority: priority === "high" ? "High" : priority === "low" ? "Low" : "Medium",
    assigned: item.assignedTo ?? "Unassigned",
    due: due ? (due.getTime() < Date.now() ? "Overdue" : due.toDateString() === new Date().toDateString() ? "Today" : due.toLocaleDateString()) : "-",
    initials: item.candidateName.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
    color: "blue"
  };
}

function QueueRow({ item, selected, onSelect, onAction }: { item: QueueItem; selected: boolean; onSelect: (id: string) => void; onAction: (action: string) => void }) {
  const candidateBasePath = "/candidates/" + encodeURIComponent(item.candidateId);
  const jobQuery = "?jobId=" + encodeURIComponent(item.jobId);
  return <tr className={selected ? "selected" : ""}><td className="review-check-cell"><input aria-label={"Select " + item.candidateId} type="checkbox" checked={selected} onChange={() => onSelect(item.itemId)} /></td><td><div className="review-candidate"><span className={"review-avatar " + item.color}>{item.initials}</span><div><Link href={candidateBasePath + "/profile" + jobQuery}>{item.candidateId}</Link><small>Source CV: {item.sourceName}</small><small>Batch: {item.batchId ?? "Not linked"}</small></div></div></td><td><span className={"review-score " + (item.score < 70 ? "low" : "")}>{item.score}/100</span></td><td className="review-job">{item.job}</td><td><span className="review-reason"><ShieldAlert size={13} />{item.reason}</span></td><td><span className={"review-priority " + item.priority.toLowerCase()}><ArrowUp size={13} />{item.priority}</span></td><td>{item.assigned}</td><td className={item.due === "Overdue" ? "review-overdue" : ""}>{item.due}</td><td><div className="review-row-actions"><Link href={candidateBasePath + "/match-analysis" + jobQuery} aria-label={"Open " + item.candidateId}><ExternalLink size={15} /></Link><button type="button" aria-label={"More actions for " + item.candidateId} onClick={() => onAction("More")}><MoreVertical size={15} /></button></div></td></tr>;
}
