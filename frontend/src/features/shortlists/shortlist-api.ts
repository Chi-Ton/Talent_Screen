import { apiRequest } from "@/lib/api-client";

export type ApiShortlistItem = {
  applicationId: string;
  candidateId: string;
  candidateName: string;
  jobId: string;
  jobTitle: string;
  score: number;
  recommendation: string | null;
  stage: string;
  matchedSkills: string[];
  updatedAt: string;
};

export function fetchShortlists() {
  return apiRequest<ApiShortlistItem[]>("/shortlists");
}

export function addShortlists(candidateIds: string[]) {
  return apiRequest<{ shortlistedCount: number; candidateIds: string[] }>("/shortlists", {
    method: "POST",
    body: JSON.stringify({ candidateIds })
  });
}

export function removeShortlist(candidateId: string) {
  return apiRequest<{ candidateId: string; stage: string }>(`/shortlists/${encodeURIComponent(candidateId)}`, { method: "DELETE" });
}

export function moveShortlistStage(candidateId: string, stage: string) {
  return apiRequest<{ candidateId: string; stage: string }>(`/shortlists/${encodeURIComponent(candidateId)}`, {
    method: "PATCH",
    body: JSON.stringify({ stage })
  });
}
