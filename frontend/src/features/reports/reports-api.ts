import { apiRequest } from "@/lib/api-client";

export type ApiReportSkill = {
  label: string;
  count: number;
  percentage: number;
};

export type ApiReportSummary = {
  candidateCount: number;
  processedFiles: number;
  failedFiles: number;
  scoredCandidates: number;
  averageScore: number;
  strongMatches: number;
  recommendationCounts: {
    strongRecommend: number;
    recommend: number;
    reviewNeeded: number;
    reject: number;
    pending: number;
  };
  scoreDistribution: number[];
  topMatchedSkills: ApiReportSkill[];
  topMissingSkills: ApiReportSkill[];
  executiveSummary: string;
};

export type ApiReport = {
  id: string;
  title: string;
  type: string;
  status: string;
  jobId: string | null;
  jobTitle?: string | null;
  batchId?: string | null;
  batchName?: string | null;
  summary: ApiReportSummary;
  candidateCount?: number;
  parameters?: Record<string, unknown>;
  createdAt: string;
  completedAt: string | null;
  candidates?: Array<{
    id: string;
    name: string;
    score: number;
    recommendation: string | null;
    matchedSkills: string[];
    missingSkills: string[];
  }>;
};

export function fetchReports() {
  return apiRequest<ApiReport[]>("/reports");
}

export function fetchReport(reportId: string) {
  return apiRequest<ApiReport>(`/reports/${encodeURIComponent(reportId)}`);
}

export function regenerateReport(reportId: string) {
  return apiRequest<ApiReport>(`/reports/${encodeURIComponent(reportId)}/regenerate`, { method: "POST" });
}
