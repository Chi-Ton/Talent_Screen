import { apiRequest } from "@/lib/api-client";

export type DashboardJob = {
  id: string;
  title: string;
  department: string;
  status: string;
  candidateCount: number;
  strongMatches: number;
  averageScore: number;
};

export type DashboardBatch = {
  id: string;
  jobId: string;
  name: string;
  status: string;
  totalFiles: number;
  processedFiles: number;
  failedFiles: number;
  duplicateFiles: number;
  createdAt: string;
};

export type DashboardCandidate = {
  id: string;
  name: string;
  targetRole: string;
  jobId: string;
  score: number;
  recommendation: string | null;
};

export type DashboardReport = {
  id: string;
  title: string;
  status: string;
  jobId: string | null;
  createdAt: string;
};

export type DashboardData = {
  jobs: DashboardJob[];
  batches: DashboardBatch[];
  candidates: DashboardCandidate[];
  reports: DashboardReport[];
};

export async function fetchDashboardData(): Promise<DashboardData> {
  const [jobs, batches, candidates, reports] = await Promise.all([
    apiRequest<DashboardJob[]>("/jobs"),
    apiRequest<DashboardBatch[]>("/batches"),
    apiRequest<DashboardCandidate[]>("/candidates"),
    apiRequest<DashboardReport[]>("/reports")
  ]);

  return { jobs, batches, candidates, reports };
}

