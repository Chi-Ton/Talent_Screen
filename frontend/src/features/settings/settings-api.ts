import { apiRequest } from "@/lib/api-client";

export type ApiAccount = {
  id: string;
  name: string;
  email: string;
  jobTitle: string | null;
  avatarUrl: string | null;
  status: string;
  mfaEnabled: boolean;
  timezone: string;
  language: string;
  emailNotifications: Record<string, boolean>;
  browserNotifications: Record<string, boolean>;
};

export type ApiTaxonomySkill = {
  categoryCode: string;
  categoryName: string;
  skillId: string;
  name: string;
  description: string | null;
};

export type ApiRubric = {
  id: string;
  name: string;
  version: number;
  totalWeight: number;
  thresholds: Record<string, unknown>;
  criteria: Array<{ pillarCode: string; pillarName: string; criterionCode: string; criterionName: string; description: string | null; weight: number }>;
  disqualifiers: Array<{ type: string; label: string; enabled: boolean }>;
};

export type ApiAIProviderStatus = {
  provider: string;
  model: string | null;
  configured: boolean;
  apiKeyConfigured: boolean;
  baseUrl: string | null;
  timeoutSeconds: number;
  retryCount: number;
  privacyMode: string;
  piiRedactionEnabled: boolean;
  extractedTextStored: boolean;
  remoteProcessing: boolean;
  zeroRetentionVerified: boolean;
  retentionNotice: string;
};

export type ApiDataRetentionStatus = {
  retentionDays: number;
  cutoffAt: string;
  availableLocalFiles: number;
  eligibleFiles: number;
  eligibleBytes: number;
  alreadyMissingFiles: number;
  executionMode: "manual_confirmation";
};

export type ApiDataRetentionPurgeResult = {
  deletedFiles: number;
  deletedBytes: number;
  retentionDays: number;
  cutoffAt: string;
};

export function fetchAccount() {
  return apiRequest<ApiAccount>("/settings/account");
}

export function updateAccount(payload: Partial<Pick<ApiAccount, "name" | "jobTitle" | "timezone" | "language">> & { emailNotifications?: Record<string, boolean>; browserNotifications?: Record<string, boolean> }) {
  const { name, ...rest } = payload;
  return apiRequest<ApiAccount>("/settings/account", { method: "PATCH", body: JSON.stringify({ fullName: name, ...rest }) });
}

export function fetchTaxonomy() {
  return apiRequest<ApiTaxonomySkill[]>("/settings/ai-taxonomy");
}

export function createTaxonomySkill(payload: { categoryCode: string; name: string; description?: string }) {
  return apiRequest<ApiTaxonomySkill>("/settings/ai-taxonomy/skills", { method: "POST", body: JSON.stringify(payload) });
}

export function fetchRubric() {
  return apiRequest<ApiRubric>("/settings/rubric");
}

export function fetchAIProviderStatus() {
  return apiRequest<ApiAIProviderStatus>("/settings/ai-provider/status");
}

export function testAIProvider() {
  return apiRequest<{ status: string; provider: string; model: string; privacyMode: string }>("/settings/ai-provider/test", { method: "POST" });
}

export function fetchDataRetentionStatus() {
  return apiRequest<ApiDataRetentionStatus>("/settings/data-retention");
}

export function purgeExpiredCvFiles() {
  return apiRequest<ApiDataRetentionPurgeResult>("/settings/data-retention/purge-expired", {
    method: "POST",
    body: JSON.stringify({ confirm: true })
  });
}
