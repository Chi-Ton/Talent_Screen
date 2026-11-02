"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUpDown,
  Download,
  MoreVertical,
  Search,
  Star,
  Upload,
  UsersRound,
  X
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ApiError } from "@/lib/api-client";
import { addApplicationsToShortlist, fetchCandidates, type ApiCandidate } from "@/features/candidates/candidates-api";
import { formatCandidateScore } from "@/features/candidates/candidate-format";
import { fetchJobs, type ApiJob } from "@/features/jobs/jobs-api";

type Recommendation = "Strong Recommend" | "Recommend" | "Review Needed" | "Reject";
type CandidateStatus = "New" | "Reviewed" | "Shortlisted";

type Candidate = {
  id: string;
  name: string;
  sourceFilename: string | null;
  jobId: string;
  targetRole: string;
  applicationId: string;
  rubricId?: string;
  scoringVersion?: string | null;
  score: number | null;
  recommendation: Recommendation;
  matched: number;
  totalSkills: number;
  missing?: string;
  experience: number | null;
  skills: string[];
  status: CandidateStatus;
};

function recommendationLabel(recommendation: ApiCandidate["recommendation"]): Recommendation {
  if (recommendation === "strong_recommend") return "Strong Recommend";
  if (recommendation === "review_needed") return "Review Needed";
  if (recommendation === "reject") return "Reject";
  return recommendation === "recommend" ? "Recommend" : "Review Needed";
}

function toCandidateRow(candidate: ApiCandidate): Candidate {
  return {
    id: candidate.id,
    name: candidate.displayName || candidate.name || candidate.sourceFilename || "Unnamed candidate",
    sourceFilename: candidate.sourceFilename ?? candidate.resume?.filename ?? null,
    jobId: candidate.jobId,
    targetRole: candidate.targetRole,
    applicationId: candidate.applicationId,
    rubricId: candidate.rubricId,
    scoringVersion: candidate.scoringVersion,
    score: candidate.score,
    recommendation: recommendationLabel(candidate.recommendation),
    matched: candidate.matchedSkills.length,
    totalSkills: candidate.matchedSkills.length + candidate.missingSkills.length,
    missing: candidate.missingSkills.length ? candidate.missingSkills.join(", ") : undefined,
    experience: candidate.experienceYears,
    skills: candidate.matchedSkills,
    status: candidate.pipelineStage === "shortlisted" ? "Shortlisted" : candidate.pipelineStage === "new" || candidate.pipelineStage === "pending" ? "New" : "Reviewed"
  };
}

function candidateKey(candidate: Candidate) {
  return candidate.applicationId || `${candidate.id}:${candidate.jobId}`;
}

export function RankedCandidates() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [jobs, setJobs] = useState<ApiJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [minScore, setMinScore] = useState("0");
  const [selectedJobId, setSelectedJobId] = useState("");
  const [recommendation, setRecommendation] = useState("All");
  const [skill, setSkill] = useState("All");
  const [experience, setExperience] = useState("All");
  const [candidateStatus, setCandidateStatus] = useState("All");
  const [sort, setSort] = useState("score-desc");
  const [selected, setSelected] = useState<string[]>([]);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const requestedJobId = search.get("jobId") ?? undefined;
    const batchId = search.get("batchId") ?? undefined;
    Promise.all([fetchCandidates(undefined, batchId), fetchJobs()])
      .then(([data, availableJobs]) => {
        const rows = data.map(toCandidateRow);
        setCandidates(rows);
        setJobs(availableJobs);
        setSelectedJobId(requestedJobId && availableJobs.some((job) => job.id === requestedJobId) ? requestedJobId : rows[0]?.jobId ?? availableJobs.find((job) => job.status === "active")?.id ?? availableJobs[0]?.id ?? "");
      })
      .catch((error) => setLoadError(error instanceof ApiError ? error.message : "Unable to load candidates."))
      .finally(() => setIsLoading(false));
  }, []);

  const filteredCandidates = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const result = candidates.filter((candidate) => (!normalized || (candidate.name + " " + (candidate.sourceFilename ?? "") + " " + candidate.skills.join(" ")).toLowerCase().includes(normalized))
      && candidate.jobId === selectedJobId
      && (Number(minScore) === 0 || (candidate.score !== null && candidate.score >= Number(minScore)))
      && (recommendation === "All" || candidate.recommendation === recommendation)
      && (skill === "All" || candidate.skills.includes(skill))
      && (experience === "All" || (candidate.experience !== null && ((experience === "0-2" && candidate.experience <= 2) || (experience === "3-5" && candidate.experience >= 3 && candidate.experience <= 5) || (experience === "6+" && candidate.experience >= 6))))
      && (candidateStatus === "All" || candidate.status === candidateStatus));
    return result.sort((a, b) => sort === "score-asc" ? (a.score ?? Infinity) - (b.score ?? Infinity) : sort === "experience" ? (b.experience ?? -1) - (a.experience ?? -1) : (b.score ?? -1) - (a.score ?? -1));
  }, [candidateStatus, candidates, experience, minScore, query, recommendation, selectedJobId, skill, sort]);

  const targetRoles = useMemo(() => {
    const roles = new Map<string, string>();
    jobs.forEach((job) => roles.set(job.id, job.title));
    candidates.forEach((candidate) => roles.set(candidate.jobId, candidate.targetRole));
    return [...roles.entries()].map(([id, title]) => ({ id, title }));
  }, [candidates, jobs]);

  const selectedRole = targetRoles.find((role) => role.id === selectedJobId)?.title ?? "Select a target role";

  const visibleIds = filteredCandidates.map(candidateKey);
  const selectedCandidates = candidates.filter((candidate) => selected.includes(candidateKey(candidate)));
  const canCompare = selectedCandidates.length >= 2 && selectedCandidates.length <= 3
    && new Set(selectedCandidates.map((candidate) => `${candidate.jobId}:${candidate.rubricId}:${candidate.scoringVersion}`)).size === 1;
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));

  function clearAllFilters() {
    setQuery("");
    setMinScore("0");
    setRecommendation("All");
    setSkill("All");
    setExperience("All");
    setCandidateStatus("All");
  }

  function toggleAll() {
    setSelected((current) => allSelected ? current.filter((id) => !visibleIds.includes(id)) : [...new Set([...current, ...visibleIds])]);
  }

  function toggleSelected(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function shortlistSelected() {
    if (!selected.length) return;
    const applicationIds = candidates.filter((candidate) => selected.includes(candidateKey(candidate))).map((candidate) => candidate.applicationId);
    try {
      const result = await addApplicationsToShortlist(applicationIds);
      setCandidates((current) => current.map((candidate) => selected.includes(candidateKey(candidate)) ? { ...candidate, status: "Shortlisted" } : candidate));
      setNotice(result.shortlistedCount + " candidate" + (result.shortlistedCount === 1 ? "" : "s") + " shortlisted.");
      setSelected([]);
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : "Unable to update shortlist.");
    }
  }

  function exportCandidates() {
    const rows = ["Candidate,Source CV,Score,Recommendation,Must-have Match,Experience,Status", ...filteredCandidates.map((candidate) => [candidate.name, candidate.sourceFilename ?? "", formatCandidateScore(candidate.score), candidate.recommendation, candidate.matched + "/" + candidate.totalSkills, candidate.experience === null ? "Not stated" : candidate.experience + " years", candidate.status].join(","))];
    const url = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "ranked-candidates.csv";
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice("Candidate ranking exported.");
  }

  return (
    <AppShell activePath="/results" breadcrumb="CV Screening / Results" searchValue={query} onSearchChange={setQuery}>
      <div className="ranked-page">
        <header className="ranked-header">
          <div><h1 className="page-title">Evaluation Results <span>({filteredCandidates.length} candidates)</span></h1><p className="ranked-role-context">Ranked only against: <strong>{selectedRole}</strong></p></div>
          <div className="ranked-header-actions">{canCompare ? <Link className="button" href={"/compare?applications=" + selected.join(",") + "&jobId=" + encodeURIComponent(selectedJobId)}><UsersRound size={15} />Compare ({selected.length})</Link> : <button className="button" type="button" disabled title="Select two or three results using the same scoring rubric"><UsersRound size={15} />Compare</button>}<button className="button" type="button" onClick={exportCandidates}><Download size={15} />Export</button><Link className="button primary" href="/screen"><Upload size={15} />Evaluate CVs</Link></div>
        </header>

        {isLoading ? <div className="ranked-processing-banner"><span><UsersRound size={16} /><strong>Loading:</strong> Fetching ranked candidates.</span></div> : null}
        {loadError ? <div className="ranked-notice" role="alert">{loadError}</div> : null}

        <section className="ranked-filter-area">
          <div className="ranked-filter-row">
            <label className="ranked-role-filter"><span className="sr-only">Target role</span><select value={selectedJobId} onChange={(event) => { setSelectedJobId(event.target.value); setSelected([]); }} disabled={!targetRoles.length}><option value="">Select target role</option>{targetRoles.map((role) => <option value={role.id} key={role.id}>{role.title}</option>)}</select></label>
            <label className="ranked-search"><Search size={15} /><span className="sr-only">Search candidates</span><input placeholder="Search candidates..." value={query} onChange={(event) => setQuery(event.target.value)} /></label>
            <label><span className="sr-only">Minimum score</span><select value={minScore} onChange={(event) => setMinScore(event.target.value)}><option value="0">Min Score</option><option value="70">70%+</option><option value="80">80%+</option><option value="90">90%+</option></select></label>
            <label><span className="sr-only">Recommendation tier</span><select value={recommendation} onChange={(event) => setRecommendation(event.target.value)}><option value="All">Rec. Tier</option><option>Strong Recommend</option><option>Recommend</option><option>Review Needed</option></select></label>
            <label><span className="sr-only">Must-have skill</span><select value={skill} onChange={(event) => setSkill(event.target.value)}><option value="All">Must-have Skill</option>{[...new Set(candidates.flatMap((candidate) => candidate.skills))].map((item) => <option key={item}>{item}</option>)}</select></label>
            <label><span className="sr-only">Experience</span><select value={experience} onChange={(event) => setExperience(event.target.value)}><option value="All">Experience</option><option value="0-2">0-2 years</option><option value="3-5">3-5 years</option><option value="6+">6+ years</option></select></label>
            <label><span className="sr-only">Candidate status</span><select value={candidateStatus} onChange={(event) => setCandidateStatus(event.target.value)}><option value="All">Status</option><option>New</option><option>Reviewed</option><option>Shortlisted</option></select></label>
            <label className="ranked-sort"><ArrowUpDown size={14} /><span className="sr-only">Sort candidates</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="score-desc">Sort by: Score (High to Low)</option><option value="score-asc">Sort by: Score (Low to High)</option><option value="experience">Sort by: Experience</option></select></label>
          </div>
          <div className="ranked-active-filters"><span>Active filters:</span>{Number(minScore) > 0 ? <button type="button" onClick={() => setMinScore("0")}>Min Score: {minScore}%+ <X size={12} /></button> : null}{recommendation !== "All" ? <button type="button" onClick={() => setRecommendation("All")}>Tier: {recommendation} <X size={12} /></button> : null}<button className="ranked-clear-link" type="button" onClick={clearAllFilters}>Clear all</button></div>
        </section>

        {selected.length > 0 ? <div className="ranked-selection-bar"><strong>{selected.length} selected</strong><button type="button" onClick={shortlistSelected}><Star size={14} />Add to shortlist</button><button type="button" onClick={() => setSelected([])}>Clear selection</button></div> : null}
        {notice ? <div className="ranked-notice" role="status">{notice}<button type="button" aria-label="Dismiss notice" onClick={() => setNotice("")}><X size={14} /></button></div> : null}

        <section className="ranked-table-card">
          <div className="ranked-table-wrap"><table className="ranked-table"><thead><tr><th className="ranked-check-cell"><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all visible candidates" /></th><th>Rank <ArrowDown size={12} /></th><th>Candidate</th><th>Overall Score</th><th>Recommendation</th><th>Must-have Match</th><th>Experience</th><th>Top Skills</th><th>Status</th><th className="ranked-action-cell"></th></tr></thead><tbody>{filteredCandidates.map((candidate, index) => { const candidateBasePath = "/candidates/" + encodeURIComponent(candidate.id); const jobQuery = "?jobId=" + encodeURIComponent(candidate.jobId); const key = candidateKey(candidate); return <tr key={key}><td className="ranked-check-cell"><input type="checkbox" checked={selected.includes(key)} onChange={() => toggleSelected(key)} aria-label={"Select " + candidate.name} /></td><td><strong>#{index + 1}</strong></td><td><Link className="ranked-candidate-link" href={candidateBasePath + "/profile" + jobQuery}>{candidate.name}</Link><small>{candidate.sourceFilename ?? "Source CV unavailable"}</small></td><td><strong className={"ranked-score " + (candidate.score !== null && candidate.score >= 85 ? "high" : "")}>{formatCandidateScore(candidate.score)}</strong></td><td><span className={"ranked-recommendation " + candidate.recommendation.toLowerCase().replaceAll(" ", "-")}>{candidate.recommendation}</span></td><td><strong>{candidate.matched}/{candidate.totalSkills}</strong> <small className={candidate.missing ? "missing-skill" : ""}>{candidate.missing ? "(Missing: " + candidate.missing + ")" : candidate.totalSkills ? "(100%)" : "(No criteria)"}</small></td><td>{candidate.experience === null ? "Not stated" : `${candidate.experience} yrs`}</td><td><div className="ranked-skill-list">{candidate.skills.map((item) => <span key={item}>{item}</span>)}</div></td><td><span className={"ranked-candidate-status " + candidate.status.toLowerCase()}><i />{candidate.status}</span></td><td className="ranked-action-cell"><div className="ranked-menu"><button type="button" aria-label={"More actions for " + candidate.name} onClick={() => setOpenMenu((current) => current === key ? null : key)}><MoreVertical size={16} /></button>{openMenu === key ? <div><Link href={candidateBasePath + "/profile" + jobQuery}>View profile</Link><Link href={candidateBasePath + "/match-analysis" + jobQuery}>Match analysis</Link><button type="button" onClick={() => { toggleSelected(key); setOpenMenu(null); }}>Select candidate</button></div> : null}</div></td></tr>; })}{filteredCandidates.length === 0 ? <tr><td className="ranked-empty" colSpan={10}>No candidates match the current filters. <button type="button" onClick={clearAllFilters}>Clear filters</button></td></tr> : null}</tbody></table></div>
          <footer className="ranked-pagination"><span>Showing all <strong>{filteredCandidates.length}</strong> candidates for this target role.</span></footer>
        </section>
      </div>
    </AppShell>
  );
}
