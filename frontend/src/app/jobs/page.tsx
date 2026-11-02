"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownUp,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  FileBarChart2,
  Filter,
  MoreVertical,
  Plus,
  Search,
  Upload,
  UsersRound
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ApiError } from "@/lib/api-client";
import { ApiJob, fetchJobs } from "@/features/jobs/jobs-api";

type JobStatus = "Active" | "Draft" | "Paused" | "Closed" | "Archived";

type Job = {
  id: string;
  role: string;
  department: string;
  status: JobStatus;
  candidates: number;
  matches: number;
  score: string;
  owner: string;
  created: string;
  createdAt: string;
};

const pageSize = 10;

function toJobStatus(status: ApiJob["status"]): JobStatus {
  return status.charAt(0).toUpperCase() + status.slice(1) as JobStatus;
}

function toJobRow(job: ApiJob): Job {
  return {
    id: job.id,
    role: job.title,
    department: job.department,
    status: toJobStatus(job.status),
    candidates: job.candidateCount,
    matches: job.strongMatches,
    score: job.averageScore > 0 ? `${Math.round(job.averageScore)}%` : "-",
    owner: job.ownerName ?? "Unassigned",
    created: job.createdAt ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(job.createdAt)) : "-",
    createdAt: job.createdAt ?? ""
  };
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");
  const [department, setDepartment] = useState("All");
  const [owner, setOwner] = useState("All");
  const [sort, setSort] = useState("created");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [savedView, setSavedView] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    fetchJobs()
      .then((data) => {
        if (isCurrent) setJobs(data.map(toJobRow));
      })
      .catch((error) => {
        if (isCurrent) setLoadError(error instanceof ApiError ? error.message : "Unable to load job openings.");
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  const filteredJobs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const result = jobs.filter((job) => {
      const searchable = [job.id, job.role, job.department, job.owner].join(" ").toLowerCase();
      return (!normalizedQuery || searchable.includes(normalizedQuery))
        && (status === "All" || job.status === status)
        && (department === "All" || job.department === department)
        && (owner === "All" || job.owner === owner);
    });

    return [...result].sort((a, b) => {
      if (sort === "role") return a.role.localeCompare(b.role);
      if (sort === "candidates") return b.candidates - a.candidates;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [department, jobs, owner, query, sort, status]);
  const departmentOptions = useMemo(() => ["All", ...new Set(jobs.map((job) => job.department))], [jobs]);
  const ownerOptions = useMemo(() => ["All", ...new Set(jobs.map((job) => job.owner))], [jobs]);

  const pageCount = Math.max(1, Math.ceil(filteredJobs.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visibleJobs = filteredJobs.slice((safePage - 1) * pageSize, safePage * pageSize);
  const visibleIds = visibleJobs.map((job) => job.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
  const resultStart = filteredJobs.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const resultEnd = Math.min(safePage * pageSize, filteredJobs.length);

  function updateFilter(setter: (value: string) => void, value: string) {
    setter(value);
    setPage(1);
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function toggleAllVisible() {
    setSelectedIds((current) => allVisibleSelected
      ? current.filter((id) => !visibleIds.includes(id))
      : [...new Set([...current, ...visibleIds])]);
  }

  function clearFilters() {
    setQuery("");
    setStatus("All");
    setDepartment("All");
    setOwner("All");
    setPage(1);
  }

  return (
    <AppShell activePath="/jobs" breadcrumb="Recruitment / Job Openings" searchValue={query} onSearchChange={(value) => updateFilter(setQuery, value)}>
      <section className="jobs-page-header">
        <div>
          <h1 className="page-title">Job Openings</h1>
          <p className="page-subtitle">{isLoading ? "Loading jobs..." : `${jobs.length} Jobs`}</p>
        </div>
        <Link className="button primary" href="/jobs/new/basic-info"><Plus size={17} aria-hidden="true" />Create job</Link>
      </section>

      {loadError ? <div className="inline-error" role="alert">{loadError} Please sign in again or refresh the page.</div> : null}

      <section className="jobs-kpis" aria-label="Job opening summary">
        <Link className="job-kpi" href="#jobs-table" onClick={() => updateFilter(setStatus, "Active")}><span><i className="kpi-dot active" />Active</span><strong>{jobs.filter((job) => job.status === "Active").length}</strong></Link>
        <Link className="job-kpi" href="#jobs-table" onClick={() => updateFilter(setStatus, "Draft")}><span><i className="kpi-dot draft" />Draft</span><strong>{jobs.filter((job) => job.status === "Draft").length}</strong></Link>
        <Link className="job-kpi" href="#jobs-table" onClick={() => updateFilter(setStatus, "Closed")}><span><i className="kpi-dot closed" />Closed</span><strong>{jobs.filter((job) => job.status === "Closed").length}</strong></Link>
        <Link className="job-kpi" href="/candidates/ranked"><span><UsersRound size={15} />Total candidates</span><strong>{jobs.reduce((sum, job) => sum + job.candidates, 0).toLocaleString("en-US")}</strong></Link>
      </section>

      <section className="jobs-table-card" id="jobs-table">
        <div className="jobs-filter-bar">
          <div className="jobs-filter-left">
            <label className="jobs-search">
              <Search size={17} aria-hidden="true" />
              <span className="sr-only">Search roles or job IDs</span>
              <input placeholder="Search roles, IDs..." value={query} onChange={(event) => updateFilter(setQuery, event.target.value)} />
            </label>
            <div className={"jobs-filter-controls" + (mobileFiltersOpen ? " mobile-open" : "")}>
              <label className="select-control"><span className="sr-only">Status</span><select value={status} onChange={(event) => updateFilter(setStatus, event.target.value)}><option>All</option><option>Active</option><option>Draft</option><option>Closed</option></select><Filter size={14} aria-hidden="true" /></label>
              <label className="select-control"><span className="sr-only">Department</span><select value={department} onChange={(event) => updateFilter(setDepartment, event.target.value)}>{departmentOptions.map((item) => <option key={item}>{item}</option>)}</select><Filter size={14} aria-hidden="true" /></label>
              <label className="select-control"><span className="sr-only">Owner</span><select value={owner} onChange={(event) => updateFilter(setOwner, event.target.value)}>{ownerOptions.map((item) => <option key={item}>{item}</option>)}</select><Filter size={14} aria-hidden="true" /></label>
              <button className="clear-filter-button" type="button" onClick={clearFilters}>Clear filters</button>
            </div>
            <button className="mobile-filter-button" type="button" onClick={() => setMobileFiltersOpen((current) => !current)}><Filter size={16} aria-hidden="true" />Filters</button>
          </div>
          <div className="jobs-filter-right">
            <label className="select-control sort-control"><ArrowDownUp size={16} aria-hidden="true" /><span className="sr-only">Sort jobs</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="created">Sort: Created date</option><option value="role">Sort: Role</option><option value="candidates">Sort: Candidates</option></select></label>
            <button className={"toolbar-button" + (savedView ? " selected" : "")} type="button" onClick={() => setSavedView((current) => !current)}><Bookmark size={16} aria-hidden="true" />{savedView ? "Saved" : "Saved Views"}</button>
          </div>
        </div>

        {selectedIds.length > 0 ? <div className="selection-bar"><span>{selectedIds.length} selected</span><Link href="/batches/upload"><Upload size={15} aria-hidden="true" />Upload CVs</Link><button type="button" onClick={() => setSelectedIds([])}>Clear selection</button></div> : null}

        <div className="jobs-desktop-table">
          <table className="jobs-table">
            <thead>
              <tr>
                <th className="checkbox-cell"><input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} aria-label="Select all visible jobs" /></th>
                <th>Job ID</th><th>Role</th><th>Department</th><th>Status</th><th className="number-cell">Candidates</th><th className="number-cell">Strong matches</th><th className="number-cell">Avg score</th><th>Owner</th><th>Created date</th><th className="action-cell">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? <tr><td className="jobs-empty" colSpan={11}>Loading connected job openings...</td></tr> : null}
              {visibleJobs.map((job) => <JobRow key={job.id} job={job} selected={selectedIds.includes(job.id)} onToggle={() => toggleSelected(job.id)} />)}
              {!isLoading && visibleJobs.length === 0 ? <tr><td className="jobs-empty" colSpan={11}>No job openings match the selected filters. <button type="button" onClick={clearFilters}>Clear filters</button></td></tr> : null}
            </tbody>
          </table>
        </div>

        <div className="jobs-mobile-list">
          {isLoading ? <div className="jobs-empty">Loading connected job openings...</div> : null}
          {visibleJobs.map((job) => <JobCard key={job.id} job={job} selected={selectedIds.includes(job.id)} onToggle={() => toggleSelected(job.id)} />)}
          {!isLoading && visibleJobs.length === 0 ? <div className="jobs-empty">No job openings match the selected filters. <button type="button" onClick={clearFilters}>Clear filters</button></div> : null}
        </div>

        <footer className="jobs-pagination">
          <p>Showing <strong>{resultStart}-{resultEnd}</strong> of <strong>{filteredJobs.length}</strong></p>
          <div>
            <button type="button" disabled={safePage === 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeft size={15} aria-hidden="true" />Previous</button>
            <button type="button" disabled={safePage >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>Next<ChevronRight size={15} aria-hidden="true" /></button>
          </div>
        </footer>
      </section>
    </AppShell>
  );
}

function StatusBadge({ status }: { status: JobStatus }) {
  return <span className={"job-status " + status.toLowerCase()}><i />{status}</span>;
}

function JobRow({ job, selected, onToggle }: { job: Job; selected: boolean; onToggle: () => void }) {
  return (
    <tr>
      <td className="checkbox-cell"><input type="checkbox" checked={selected} onChange={onToggle} aria-label={"Select " + job.role} /></td>
      <td className="job-id"><Link href={"/jobs/" + job.id}>{job.id}</Link></td>
      <td className="job-role"><Link href={"/jobs/" + job.id}>{job.role}</Link></td>
      <td className="muted-cell">{job.department}</td>
      <td><StatusBadge status={job.status} /></td>
      <td className="number-cell">{job.candidates}</td>
      <td className="number-cell match-number">{job.matches}</td>
      <td className="number-cell">{job.score}</td>
      <td>{job.owner}</td>
      <td className="muted-cell">{job.created}</td>
      <td className="action-cell"><div className="row-actions">{job.status === "Draft" ? <Link href={"/jobs/" + job.id}>Edit Draft</Link> : job.status === "Closed" ? <Link href={"/reports/" + job.id}>View Report</Link> : <Link href={"/batches/upload?jobId=" + job.id}><Upload size={14} aria-hidden="true" />Upload CVs</Link>}<details className="more-menu"><summary aria-label={"More actions for " + job.id}><MoreVertical size={17} aria-hidden="true" /></summary><div><Link href={"/jobs/" + job.id}>View job</Link><Link href={"/candidates/ranked?jobId=" + job.id}>View candidates</Link></div></details></div></td>
    </tr>
  );
}

function JobCard({ job, selected, onToggle }: { job: Job; selected: boolean; onToggle: () => void }) {
  return (
    <article className="job-mobile-card">
      <div className="job-mobile-top">
        <div><div className="job-mobile-meta"><input type="checkbox" checked={selected} onChange={onToggle} aria-label={"Select " + job.role} /><Link href={"/jobs/" + job.id}>{job.id}</Link><StatusBadge status={job.status} /></div><h2><Link href={"/jobs/" + job.id}>{job.role}</Link></h2><p>{job.department} | {job.owner}</p></div>
        <details className="more-menu"><summary aria-label={"More actions for " + job.id}><MoreVertical size={18} aria-hidden="true" /></summary><div><Link href={"/jobs/" + job.id}>View job</Link><Link href={"/candidates/ranked?jobId=" + job.id}>View candidates</Link></div></details>
      </div>
      <div className="job-mobile-stats"><div><span>Candidates</span><strong>{job.candidates}</strong></div><div><span>Matches</span><strong className="match-number">{job.matches}</strong></div><div><span>Avg Score</span><strong>{job.score}</strong></div></div>
      {job.status === "Draft" ? <Link className="mobile-action" href={"/jobs/" + job.id}>Edit Draft</Link> : job.status === "Closed" ? <Link className="mobile-action" href={"/reports/" + job.id}><FileBarChart2 size={15} aria-hidden="true" />View Report</Link> : <Link className="mobile-action" href={"/batches/upload?jobId=" + job.id}><Upload size={15} aria-hidden="true" />Upload CVs</Link>}
    </article>
  );
}
