"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Download,
  FileText,
  Plus,
  Search,
  Star,
  ThumbsUp,
  X
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ApiError } from "@/lib/api-client";
import { addApplicationsToShortlist, compareCandidateResults, fetchCandidates, removeApplicationFromShortlist, type ApiCandidate } from "@/features/candidates/candidates-api";
import { formatCandidateScore } from "@/features/candidates/candidate-format";

type Candidate = {
  id: string;
  applicationId: string;
  jobId: string;
  rubricId?: string;
  scoringVersion?: string | null;
  name: string;
  sourceFilename: string | null;
  targetRole: string;
  score: number | null;
  recommendation: string;
  initials: string;
  color: string;
  values: Record<string, string>;
  strengths: string[];
  gaps: string[];
};

const metricRows = [
  { key: "score", label: "Overall Score", type: "score" },
  { key: "recommendation", label: "Recommendation", type: "recommendation" },
  { key: "technical", label: "Technical Skills", type: "value" },
  { key: "experience", label: "Experience", type: "value" },
  { key: "projects", label: "Projects & Impact", type: "value" },
  { key: "cloud", label: "Systems & Cloud", type: "value" },
  { key: "education", label: "Education & Certifications", type: "value" },
  { key: "years", label: "Relevant Experience", type: "text" },
  { key: "location", label: "Location", type: "text" },
  { key: "skills", label: "Normalized Skills", type: "text" },
  { key: "strengths", label: "Key Strengths", type: "list" },
  { key: "gaps", label: "Gaps to Review", type: "gaps" }
];

export function CandidateComparison() {
  const [catalog, setCatalog] = useState<Candidate[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [notice, setNotice] = useState("");
  const [shortlisted, setShortlisted] = useState<string[]>([]);
  const [comparisonJobId, setComparisonJobId] = useState("");

  useEffect(() => {
    let active = true;
    async function loadCandidates() {
      try {
        const items = await fetchCandidates();
        if (!active) return;
        const params = new URLSearchParams(window.location.search);
        const requestedJobId = params.get("jobId");
        const requestedApplications = params.get("applications")?.split(",").filter(Boolean) ?? [];
        const requestedCandidateIds = params.get("ids")?.split(",").filter(Boolean) ?? [];
        const requestedItems = requestedApplications.length
          ? requestedApplications.map((applicationId) => items.find((candidate) => candidate.applicationId === applicationId)).filter((candidate): candidate is ApiCandidate => Boolean(candidate))
          : requestedCandidateIds.map((id) => items.find((candidate) => candidate.id === id)).filter((candidate): candidate is ApiCandidate => Boolean(candidate));
        const preferredJobId = requestedJobId ?? requestedItems[0]?.jobId ?? items[0]?.jobId ?? "";
        let selectedItems = requestedItems.filter((candidate) => candidate.jobId === preferredJobId).slice(0, 3);
        const compatible = (candidate: ApiCandidate) => candidate.jobId === selectedItems[0]?.jobId && candidate.rubricId === selectedItems[0]?.rubricId && candidate.scoringVersion === selectedItems[0]?.scoringVersion;
        selectedItems = selectedItems.filter(compatible);
        if (selectedItems.length < 2) {
          const grouped = new Map<string, ApiCandidate[]>();
          items.forEach((candidate) => { const key = `${candidate.jobId}:${candidate.rubricId}:${candidate.scoringVersion}`; grouped.set(key, [...(grouped.get(key) ?? []), candidate]); });
          const fallback = [...grouped.values()].find((group) => group[0]?.jobId === preferredJobId && group.length >= 2) ?? [...grouped.values()].find((group) => group.length >= 2) ?? [];
          selectedItems = fallback.slice(0, 3);
          if (requestedItems.length >= 2) setNotice("Compare results from the same role and scoring rubric.");
        }
        const activeJobId = selectedItems[0]?.jobId ?? preferredJobId;
        const details = selectedItems.length >= 2 ? await compareCandidateResults(selectedItems.map((candidate) => candidate.id)) : [];
        if (!active) return;
        const detailMap = new Map(details.map((candidate) => [candidate.applicationId, candidate]));
        setCatalog(items.map((candidate) => toComparisonCandidate(detailMap.get(candidate.applicationId) ?? candidate)));
        setSelectedKeys(selectedItems.map((candidate) => candidate.applicationId));
        setComparisonJobId(activeJobId);
        setShortlisted(selectedItems.filter((candidate) => candidate.pipelineStage === "shortlisted").map((candidate) => candidate.applicationId));
      } catch (error) {
        if (active) setNotice(error instanceof ApiError ? error.message : "Unable to load candidates for comparison.");
      }
    }
    loadCandidates();
    return () => { active = false; };
  }, []);

  const candidates = selectedKeys.map((key) => catalog.find((candidate) => candidate.applicationId === key)).filter((candidate): candidate is Candidate => Boolean(candidate));
  const available = catalog.filter((candidate) => candidate.jobId === comparisonJobId && candidate.rubricId === candidates[0]?.rubricId && candidate.scoringVersion === candidates[0]?.scoringVersion && !selectedKeys.includes(candidate.applicationId) && `${candidate.name} ${candidate.sourceFilename ?? ""} ${candidate.recommendation}`.toLowerCase().includes(searchTerm.toLowerCase()));

  function removeCandidate(id: string) {
    if (selectedKeys.length <= 2) {
      setNotice("Keep at least two candidates to compare.");
      return;
    }
    setSelectedKeys((keys) => keys.filter((key) => key !== id));
    setNotice("Candidate removed from comparison.");
  }

  async function addCandidate(id: string) {
    if (selectedKeys.length >= 3) {
      setNotice("Comparison supports up to three candidates.");
      return;
    }
    try {
      const selected = catalog.find((candidate) => candidate.applicationId === id);
      if (!selected) return;
      if (selected.jobId !== comparisonJobId) {
        setNotice("Choose candidates evaluated for the same target role.");
        return;
      }
      const details = await compareCandidateResults([...selectedKeys, id]);
      const detail = details.find((candidate) => candidate.id === id);
      if (!detail) return;
      setCatalog((items) => items.map((candidate) => candidate.applicationId === id ? toComparisonCandidate(detail) : candidate));
      setSelectedKeys((keys) => [...keys, id]);
      setSearchTerm("");
      setNotice(selected.name + " added to comparison.");
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : "Unable to load candidate details.");
    }
  }

  async function toggleShortlist(applicationId: string) {
    const nextValue = shortlisted.includes(applicationId) ? shortlisted.filter((id) => id !== applicationId) : [...shortlisted, applicationId];
    try {
      if (nextValue.includes(applicationId)) await addApplicationsToShortlist([applicationId]);
      else await removeApplicationFromShortlist(applicationId);
      setShortlisted(nextValue);
      const name = catalog.find((candidate) => candidate.applicationId === applicationId)?.name ?? "Candidate";
      setNotice(nextValue.includes(applicationId) ? name + " added to shortlist." : name + " removed from shortlist.");
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : "Unable to update shortlist.");
    }
  }

  function exportComparison() {
    const rows = ["Metric," + candidates.map((candidate) => `"${candidate.name}"`).join(",")];
    metricRows.forEach((metric) => {
      const values = candidates.map((candidate) => {
        if (metric.type === "score") return formatCandidateScore(candidate.score);
        if (metric.type === "recommendation") return candidate.recommendation;
        const value = metric.key === "strengths" || metric.key === "gaps" ? candidate[metric.key].join(" | ") : candidate.values[metric.key];
        return value;
      });
      rows.push(metric.label + "," + values.map((value) => '"' + value + '"').join(","));
    });
    const url = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "candidate-comparison.csv";
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice("Comparison exported as CSV.");
  }

  return (
    <AppShell activePath="/compare" breadcrumb="CV Screening / Compare">
      <div className="candidate-comparison-page">
        <header className="comparison-page-header">
          <div className="comparison-breadcrumb"><Link href="/screen">CV Screening</Link><ChevronRight size={14} /><Link href={comparisonJobId ? `/results?jobId=${encodeURIComponent(comparisonJobId)}` : "/results"}>Results</Link><ChevronRight size={14} /><strong>Comparison</strong></div>
          <div className="comparison-title-row"><div><h1>Candidate Comparison</h1><p><FileText size={14} />{candidates[0]?.targetRole ?? "Selected candidates"}</p></div><div className="comparison-header-actions"><Link className="button" href={comparisonJobId ? `/results?jobId=${encodeURIComponent(comparisonJobId)}` : "/results"}><ArrowLeft size={14} />Back to results</Link><button className="button primary" type="button" onClick={exportComparison} disabled={candidates.length < 2}><Download size={14} />Export comparison</button></div></div>
        </header>

        <section className="comparison-table-shell" aria-label="Candidate comparison matrix">
          <div className="comparison-table-scroll"><div className="comparison-matrix">
            <div className="comparison-row comparison-candidate-row">
              <div className="comparison-metric-cell comparison-corner-label">Metrics</div>
              {candidates.map((candidate) => <div className="comparison-candidate-cell" key={candidate.applicationId}><button className="comparison-remove" type="button" aria-label={"Remove " + candidate.name} onClick={() => removeCandidate(candidate.applicationId)}><X size={14} /></button><div className="comparison-candidate-heading"><span className={"comparison-avatar " + candidate.color}>{candidate.initials}</span><div><Link href={`/candidates/${encodeURIComponent(candidate.id)}/profile?jobId=${encodeURIComponent(candidate.jobId)}`}>{candidate.name}</Link><small>{candidate.sourceFilename ?? "Source CV unavailable"}</small><span className="comparison-recommendation"><CheckCircle2 size={12} />{candidate.recommendation}</span></div></div></div>)}
              {selectedKeys.length < 3 ? <div className="comparison-add-cell"><label htmlFor="compare-search">Add candidate to compare</label><div className="comparison-search"><Search size={14} /><input id="compare-search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search name or CV file..." /></div>{searchTerm && available.length ? <div className="comparison-search-results">{available.map((candidate) => <button type="button" key={candidate.applicationId} onClick={() => addCandidate(candidate.applicationId)}><span>{candidate.name}</span><small>{candidate.sourceFilename ?? candidate.recommendation}</small><Plus size={13} /></button>)}</div> : null}</div> : null}
            </div>
            {metricRows.map((metric) => <ComparisonMetricRow key={metric.key} metric={metric} candidates={candidates} shortlisted={shortlisted} onShortlist={toggleShortlist} />)}
            <div className="comparison-row comparison-action-row"><div className="comparison-metric-cell" /><>{candidates.map((candidate) => <div className="comparison-value-cell" key={candidate.applicationId}><div className="comparison-row-actions"><Link className="button" href={`/candidates/${encodeURIComponent(candidate.id)}/match-analysis?jobId=${encodeURIComponent(candidate.jobId)}`}>Match Analysis <ArrowRight size={13} /></Link><button className={"button " + (shortlisted.includes(candidate.applicationId) ? "comparison-shortlisted" : "")} type="button" onClick={() => toggleShortlist(candidate.applicationId)}><Star size={13} />{shortlisted.includes(candidate.applicationId) ? "Shortlisted" : "Shortlist"}</button></div></div>)}</>
            </div>
          </div></div>
        </section>
        {notice ? <div className="comparison-toast" role="status"><CheckCircle2 size={15} />{notice}<button type="button" aria-label="Dismiss notice" onClick={() => setNotice("")}><X size={14} /></button></div> : null}
      </div>
    </AppShell>
  );
}

function ComparisonMetricRow({ metric, candidates }: { metric: { key: string; label: string; type: string }; candidates: Candidate[]; shortlisted: string[]; onShortlist: (id: string) => void }) {
  const bestScore = Math.max(...candidates.map((candidate) => candidate.score ?? -1), 0);
  return <div className="comparison-row"><div className="comparison-metric-cell"><span>{metric.label}</span>{metric.type === "score" ? <small>Weighted rubric result</small> : null}</div>{candidates.map((candidate) => {
    const listValues = metric.key === "strengths" ? candidate.strengths : candidate.gaps;
    return <div className={"comparison-value-cell " + (metric.type === "score" && candidate.score !== null && candidate.score === bestScore ? "comparison-best-cell" : "")} key={candidate.applicationId}>{metric.type === "score" ? <strong className="comparison-score-value">{formatCandidateScore(candidate.score)}</strong> : metric.type === "recommendation" ? <span className="comparison-recommendation comparison-recommendation-large"><ThumbsUp size={13} />{candidate.recommendation}</span> : metric.type === "list" || metric.type === "gaps" ? <ul className={metric.type === "gaps" ? "comparison-gaps" : "comparison-strengths"}>{(listValues.length ? listValues : [metric.type === "gaps" ? "No grounded gaps recorded" : "No grounded strengths recorded"]).map((item: string) => <li key={item}>{metric.type === "gaps" ? <X size={12} /> : <Check size={12} />}{item}</li>)}</ul> : <span className="comparison-value-text">{candidate.values[metric.key]}</span>}</div>;
  })}</div>;
}

function toComparisonCandidate(candidate: ApiCandidate): Candidate {
  const scoreValue = (prefix: string) => {
    const aliases: Record<string, string> = { P1: "skills", P2: "experience", P3: "projects", P4: "systems", P5: "education" };
    const pillar = candidate.scoreBreakdown?.find((item) => item.pillarCode.startsWith(prefix) || item.pillarCode === aliases[prefix]);
    return pillar ? `${pillar.earnedScore} / ${pillar.maxScore}` : "Not scored";
  };
  const name = candidate.displayName || candidate.name || candidate.sourceFilename || "Unnamed candidate";
  return { id: candidate.id, applicationId: candidate.applicationId, jobId: candidate.jobId, rubricId: candidate.rubricId, scoringVersion: candidate.scoringVersion, name, sourceFilename: candidate.sourceFilename ?? candidate.resume?.filename ?? null, targetRole: candidate.targetRole, score: candidate.score, recommendation: formatRecommendation(candidate.recommendation), initials: name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase(), color: "blue", values: { technical: scoreValue("P1"), experience: scoreValue("P2"), projects: scoreValue("P3"), cloud: scoreValue("P4"), education: scoreValue("P5"), years: candidate.experienceYears !== null ? candidate.experienceYears + " years" : "Not stated", location: candidate.location ?? "Not stated", skills: (candidate.skills ?? candidate.matchedSkills).join(", ") || "None detected" }, strengths: candidate.matchedSkills, gaps: candidate.missingSkills };
}

function formatRecommendation(value: string | null) {
  return value ? value.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ") : "Pending review";
}
