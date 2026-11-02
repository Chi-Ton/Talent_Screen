import { apiRequest } from "@/lib/api-client";
import type { JobDraft } from "@/features/jobs/job-draft";

export type ApiJob = {
  id: string;
  title: string;
  department: string;
  status: "draft" | "active" | "paused" | "closed" | "archived";
  ownerName: string | null;
  createdAt: string | null;
  candidateCount: number;
  strongMatches: number;
  averageScore: number;
  description?: string | null;
  employmentType?: string | null;
  location?: string | null;
  workMode?: string | null;
  minimumEducation?: string | null;
  minimumExperienceYears?: number | null;
  publishedAt?: string | null;
};

export function fetchJobs() {
  return apiRequest<ApiJob[]>("/jobs");
}

export function fetchJob(jobId: string) {
  return apiRequest<ApiJob>(`/jobs/${encodeURIComponent(jobId)}`);
}

export function createJob(draft: JobDraft) {
  return apiRequest<ApiJob>("/jobs", {
    method: "POST",
    body: JSON.stringify({
      title: draft.title,
      department: draft.department,
      description: draft.description,
      employmentType: draft.employmentType,
      location: draft.location,
      workMode: draft.workMode,
      minimumExperienceYears: draft.minimumExperienceYears,
      mustHaveSkills: draft.mustHaveSkills,
      niceToHaveSkills: draft.niceToHaveSkills,
      scoringWeights: draft.scoringWeights
    })
  });
}

export function publishJob(jobId: string) {
  return apiRequest<ApiJob>(`/jobs/${jobId}/publish`, { method: "POST" });
}
