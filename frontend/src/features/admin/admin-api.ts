import { apiRequest } from "@/lib/api-client";

export type ApiAdminUser = {
  id: string;
  name: string;
  email: string;
  jobTitle: string | null;
  status: string;
  roles: string[];
  team: string | null;
  lastActiveAt: string | null;
  mfaEnabled: boolean;
};

export type ApiAuditEntry = {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  traceId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export function fetchAdminUsers() {
  return apiRequest<ApiAdminUser[]>("/admin/users");
}

export function fetchAuditLogs() {
  return apiRequest<ApiAuditEntry[]>("/admin/audit-logs?limit=200");
}
