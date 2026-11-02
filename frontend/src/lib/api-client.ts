import { getAuthSession } from "@/lib/auth-storage";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";

export type ApiErrorPayload = {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
    traceId?: string;
  };
  detail?: unknown;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly traceId?: string;

  constructor(message: string, status: number, code?: string, traceId?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.traceId = traceId;
  }
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const accessToken = typeof window !== "undefined" ? getAuthSession()?.accessToken : undefined;
  const headers = new Headers(options.headers);
  const isMultipart = typeof FormData !== "undefined" && options.body instanceof FormData;
  if (!isMultipart && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (accessToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers
  });

  const payload = await response.json().catch(() => null) as T & ApiErrorPayload | null;
  if (!response.ok) {
    const apiError = payload?.error;
    const fallbackDetail = typeof payload?.detail === "string" ? payload.detail : "Request failed.";
    throw new ApiError(apiError?.message ?? fallbackDetail, response.status, apiError?.code, apiError?.traceId);
  }

  return payload as T;
}

export async function apiDownload(path: string): Promise<{ blob: Blob; filename: string | null }> {
  const accessToken = typeof window !== "undefined" ? getAuthSession()?.accessToken : undefined;
  const headers = new Headers();
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  const response = await fetch(`${API_BASE_URL}${path}`, { headers, cache: "no-store" });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as ApiErrorPayload | null;
    const apiError = payload?.error;
    const fallbackDetail = typeof payload?.detail === "string" ? payload.detail : "Download failed.";
    throw new ApiError(apiError?.message ?? fallbackDetail, response.status, apiError?.code, apiError?.traceId);
  }
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const encodedName = disposition.match(/filename\*=utf-8''([^;]+)/i)?.[1];
  const simpleName = disposition.match(/filename="?([^";]+)"?/i)?.[1];
  return {
    blob: await response.blob(),
    filename: encodedName ? decodeURIComponent(encodedName) : simpleName ?? null,
  };
}
