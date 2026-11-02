import { apiDownload, apiRequest } from "@/lib/api-client";

export type ApiCandidate = {
  id: string;
  name: string;
  displayName: string;
  sourceFilename: string | null;
  email: string | null;
  currentTitle: string | null;
  location: string | null;
  experienceYears: number | null;
  targetRole: string;
  jobId: string;
  applicationId: string;
  batchId: string | null;
  pipelineStage: string;
  rank: number | null;
  score: number | null;
  rubricId?: string;
  scoringVersion?: string | null;
  outcome?: "scored" | "review_required" | "out_of_scope" | null;
  recommendation: "strong_recommend" | "recommend" | "review_needed" | "reject" | null;
  matchedSkills: string[];
  missingSkills: string[];
  summary: string | null;
  confidence: number | null;
  skills?: string[];
  resume?: {
    filename: string | null;
    parserStatus: string | null;
    parserConfidence: number | null;
    parsedProfile: Record<string, unknown>;
    rawText: string | null;
  };
  experiences?: Array<{
    company: string;
    title: string;
    location: string | null;
    startDate: string | null;
    endDate: string | null;
    isCurrent: boolean;
    description: string | null;
    achievements: string[];
  }>;
  projects?: Array<{
    name: string;
    role: string | null;
    description: string | null;
    technologies: string[];
    achievements: string[];
    url: string | null;
  }>;
  education?: Array<{
    institution: string;
    degree: string | null;
    fieldOfStudy: string | null;
    startYear: number | null;
    endYear: number | null;
  }>;
  certifications?: Array<{
    name: string;
    issuer: string | null;
    issuedDate: string | null;
    expiresDate: string | null;
    credentialId: string | null;
  }>;
  scoreBreakdown?: Array<{
    pillarCode: string;
    pillarName: string;
    earnedScore: number;
    maxScore: number;
    percentage: number;
    criteria: Array<{
      criterionCode: string;
      criterionName: string;
      earnedScore: number;
      maxScore: number;
      confidence: number | null;
      explanation: string | null;
      evidence: string[];
    }>;
  }>;
  screening?: {
    modelName: string | null;
    providerName: string | null;
    promptVersion: string | null;
    privacyMode: string | null;
    traceId: string | null;
    isDisqualified: boolean;
    disqualifierReasons: string[];
  };
};

export function fetchCandidates(jobId?: string, batchId?: string) {
  const query = new URLSearchParams();
  if (jobId) query.set("jobId", jobId);
  if (batchId) query.set("batchId", batchId);
  return apiRequest<ApiCandidate[]>(query.size ? `/candidates?${query.toString()}` : "/candidates");
}

export function fetchCandidate(candidateId: string, jobId?: string) {
  const query = jobId ? `?jobId=${encodeURIComponent(jobId)}` : "";
  return apiRequest<ApiCandidate>(`/candidates/${encodeURIComponent(candidateId)}${query}`);
}

export function compareCandidateResults(resultIds: string[]) {
  return apiRequest<ApiCandidate[]>("/candidates/compare", {
    method: "POST",
    body: JSON.stringify({ resultIds })
  });
}

export function rescoreCandidate(candidateId: string, jobId?: string) {
  const query = jobId ? `?jobId=${encodeURIComponent(jobId)}` : "";
  return apiRequest<{ candidateId: string; status: string }>(`/candidates/${encodeURIComponent(candidateId)}/rescore${query}`, { method: "POST" });
}

export function downloadCandidateResume(candidateId: string, jobId?: string) {
  const query = jobId ? `?jobId=${encodeURIComponent(jobId)}` : "";
  return apiDownload(`/candidates/${encodeURIComponent(candidateId)}/resume${query}`);
}

export function addCandidatesToShortlist(candidateIds: string[]) {
  return apiRequest<{ shortlistedCount: number }>("/shortlists", {
    method: "POST",
    body: JSON.stringify({ candidateIds })
  });
}

export function addApplicationsToShortlist(applicationIds: string[]) {
  return apiRequest<{ shortlistedCount: number; applicationIds: string[] }>("/shortlists", {
    method: "POST",
    body: JSON.stringify({ applicationIds })
  });
}

export function removeCandidateFromShortlist(candidateId: string) {
  return apiRequest<{ candidateId: string; stage: string }>(`/shortlists/${encodeURIComponent(candidateId)}`, { method: "DELETE" });
}

export function removeApplicationFromShortlist(applicationId: string) {
  return apiRequest<{ applicationId: string; stage: string }>(`/shortlists/applications/${encodeURIComponent(applicationId)}`, { method: "DELETE" });
}

export function moveApplicationStage(applicationId: string, stage: "new" | "hr_review" | "shortlisted" | "rejected") {
  return apiRequest<{ applicationId: string; stage: string }>(`/shortlists/applications/${encodeURIComponent(applicationId)}`, {
    method: "PATCH",
    body: JSON.stringify({ stage })
  });
}
