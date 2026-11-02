import { apiRequest } from "@/lib/api-client";

export type ApiReviewItem = {
  id: string;
  candidateId: string;
  candidateName: string;
  jobId: string;
  jobTitle: string;
  batchId: string | null;
  reason: string;
  reasonCode: string;
  priority: string;
  status: string;
  score: number;
  assignedTo: string | null;
  dueAt: string | null;
  createdAt: string;
};

export function fetchReviewQueue() {
  return apiRequest<ApiReviewItem[]>("/review-queue");
}

export function assignReviewItems(itemIds: string[]) {
  return apiRequest<{ assignedCount: number; assignedTo: string }>("/review-queue/assign", {
    method: "POST",
    body: JSON.stringify({ itemIds })
  });
}

export function decideReviewItem(itemId: string, decision: string, note?: string, pipelineStage?: string) {
  return apiRequest<{ id: string; status: string; decision: string; pipelineStage: string }>(`/review-queue/${encodeURIComponent(itemId)}/decision`, {
    method: "POST",
    body: JSON.stringify({ decision, note, pipelineStage })
  });
}
