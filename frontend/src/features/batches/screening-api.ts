import { apiRequest } from "@/lib/api-client";

export type ApiBatchFile = {
  id: string;
  name: string;
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  attemptCount: number;
  parserStatus: string | null;
  parserConfidence: number | null;
  progress: number;
  candidateId: string | null;
  candidateName: string | null;
  applicationId: string | null;
  score: number | null;
  recommendation: string | null;
  createdAt: string;
  processingStartedAt: string | null;
  processingCompletedAt: string | null;
};

export type ApiBatch = {
  id: string;
  jobId: string;
  jobTitle: string | null;
  name: string;
  status: string;
  ownerName: string | null;
  totalFiles: number;
  processedFiles: number;
  failedFiles: number;
  duplicateFiles: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  files?: ApiBatchFile[];
};

export function fetchBatches() {
  return apiRequest<ApiBatch[]>("/batches");
}

export function fetchBatch(batchId: string) {
  return apiRequest<ApiBatch>(`/batches/${batchId}`);
}

export function retryBatchFailures(batchId: string) {
  return apiRequest<ApiBatch & { retriedFiles: number }>(`/batches/${batchId}/retry-failures`, { method: "POST" });
}

export function startBatchProcessing(batchId: string) {
  return apiRequest<ApiBatch>(`/batches/${batchId}/process`, { method: "POST" });
}

export function uploadBatch(jobId: string, files: File[], batchName: string) {
  const body = new FormData();
  files.forEach((file) => body.append("files", file));
  body.append("batchName", batchName);
  return apiRequest<ApiBatch>(`/jobs/${jobId}/batches`, { method: "POST", body });
}
