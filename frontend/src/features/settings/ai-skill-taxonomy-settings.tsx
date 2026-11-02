"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  History,
  LockKeyhole,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  X
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ApiError } from "@/lib/api-client";
import { useLanguage } from "@/lib/language-provider";
import {
  fetchAIProviderStatus,
  fetchDataRetentionStatus,
  purgeExpiredCvFiles,
  testAIProvider,
  type ApiAIProviderStatus,
  type ApiDataRetentionStatus
} from "@/features/settings/settings-api";

type SettingsTab = "AI Processing" | "Data Privacy";

export function AiSkillTaxonomySettings() {
  const { t } = useLanguage();
  const [tab, setTab] = useState<SettingsTab>("AI Processing");
  const [warningVisible, setWarningVisible] = useState(false);
  const [notice, setNotice] = useState("");
  const [testing, setTesting] = useState(false);
  const [purging, setPurging] = useState(false);
  const [providerStatus, setProviderStatus] = useState<ApiAIProviderStatus | null>(null);
  const [retentionStatus, setRetentionStatus] = useState<ApiDataRetentionStatus | null>(null);

  useEffect(() => {
    Promise.all([fetchAIProviderStatus(), fetchDataRetentionStatus()]).then(([provider, retention]) => {
      setProviderStatus(provider);
      setRetentionStatus(retention);
      setWarningVisible(!provider.configured);
    }).catch((error: unknown) => {
      setWarningVisible(true);
      setNotice(error instanceof ApiError ? error.message : "Unable to load the AI provider configuration.");
    });
  }, []);

  async function testConfiguration() {
    setTesting(true);
    setNotice("Testing AI provider connection...");
    try {
      const result = await testAIProvider();
      setNotice("AI provider connection is healthy: " + result.model);
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : "The AI provider health check failed.");
    } finally {
      setTesting(false);
    }
  }

  async function purgeExpiredFiles() {
    if (!retentionStatus?.eligibleFiles || !window.confirm(t("Delete expired local CV files now? Candidate profiles, scores and audit records will be preserved."))) {
      return;
    }
    setPurging(true);
    setNotice(t("Deleting expired local CV files..."));
    try {
      const result = await purgeExpiredCvFiles();
      setNotice(`${result.deletedFiles} ${t("expired local CV file(s) deleted. Screening results were preserved.")}`);
      setRetentionStatus(await fetchDataRetentionStatus());
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : t("Expired local CV files could not be deleted."));
    } finally {
      setPurging(false);
    }
  }

  return (
    <AppShell activePath="/settings" breadcrumb="Settings / AI & Privacy">
      <div className="ai-taxonomy-page">
        {warningVisible ? (
          <div className="ai-provider-warning">
            <AlertTriangle size={15} />
            <span><strong>Provider configuration required:</strong> AI processing is unavailable until a server-side provider is configured.</span>
            <button type="button" aria-label="Dismiss provider warning" onClick={() => setWarningVisible(false)}><X size={14} /></button>
          </div>
        ) : null}

        <header className="ai-taxonomy-header">
          <div className="ai-taxonomy-breadcrumb"><Link href="/dashboard">TalentScreen AI</Link><ChevronRight size={14} /><strong>Settings</strong></div>
          <h1>AI, Scoring and Privacy</h1>
        </header>

        <nav className="ai-settings-tabs" aria-label="AI settings views">
          {(["AI Processing", "Data Privacy"] as SettingsTab[]).map((item) => (
            <button className={tab === item ? "active" : ""} type="button" key={item} onClick={() => setTab(item)}>{item}</button>
          ))}
        </nav>

        {tab === "AI Processing" ? (
          <AiProcessingPanel status={providerStatus} testing={testing} onTest={testConfiguration} />
        ) : (
          <PrivacyPanel status={providerStatus} retention={retentionStatus} purging={purging} onPurge={purgeExpiredFiles} />
        )}

        {notice ? (
          <div className="ai-taxonomy-toast" role="status">
            <CheckCircle2 size={15} />{notice}
            <button type="button" aria-label="Dismiss notice" onClick={() => setNotice("")}><X size={14} /></button>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

function AiProcessingPanel({ status, testing, onTest }: { status: ApiAIProviderStatus | null; testing: boolean; onTest: () => void }) {
  const configured = status?.configured ?? false;
  const { t } = useLanguage();
  return (
    <>
      <div className="ai-processing-grid">
        <section className="ai-engine-card">
          <header>
            <div>
              <h2>Core Processing Engine</h2>
              <p>This page reports the active backend configuration. Secrets and model selection are changed only in backend/.env.</p>
            </div>
            <button className="button primary" type="button" onClick={onTest} disabled={testing}>
              <SlidersHorizontal size={13} />{testing ? "Testing..." : "Test Configuration"}
            </button>
          </header>
          <div className="ai-form-grid">
            <label>
              <span>Provider Status</span>
              <strong className="provider-status"><i className={configured ? "status-enabled" : "status-disabled"} />{configured ? "Connected · " + status?.provider : "Not configured"}</strong>
            </label>
            <label>
              <span>Model Version</span>
              <input value={status?.model ?? "Not configured"} readOnly data-no-translate="true" />
            </label>
            <label className="ai-wide-field">
              <span>API Key</span>
              <div className="api-key-field" data-no-translate="true"><LockKeyhole size={13} /><input readOnly type="text" value={status?.apiKeyConfigured ? "Server-managed secret" : "Not configured"} aria-label="Server-managed secret" /></div>
            </label>
            <label>
              <span>Configuration Source</span>
              <input value="backend/.env" readOnly data-no-translate="true" />
            </label>
            <label>
              <span>Scoring Owner</span>
              <input value={t("Deterministic backend rules")} readOnly />
            </label>
          </div>
        </section>

        <aside className="ai-side-settings">
          <section className="resiliency-card">
            <h2>Resiliency &amp; Limits</h2>
            <label><span>Request Timeout</span><div><input value={status ? status.timeoutSeconds : "-"} readOnly /><small>sec</small></div></label>
            <label><span>Retry Count</span><input value={status ? status.retryCount : "-"} readOnly /></label>
            <label><span>Raw CV text storage</span><strong className="cache-status"><CheckCircle2 size={12} />{status?.extractedTextStored ? "Enabled" : "Disabled"}</strong></label>
          </section>
          <section className="health-card">
            <ShieldCheck size={26} />
            <span>Configuration Status</span>
            {configured ? <><strong>Server configured</strong><b>Ready for evidence-grounded screening</b></> : <><strong>Not available</strong><b className="status-disabled-text">Not configured</b></>}
          </section>
        </aside>
      </div>
      <div className="ai-processing-footer">
        <Link href="/admin/audit-logs"><History size={13} />View Audit Trail</Link>
        <span className="muted-cell">Restart the backend after changing backend/.env.</span>
      </div>
    </>
  );
}

function PrivacyPanel({ status, retention, purging, onPurge }: { status: ApiAIProviderStatus | null; retention: ApiDataRetentionStatus | null; purging: boolean; onPurge: () => void }) {
  const { t } = useLanguage();
  return (
    <div className="privacy-panel-stack">
      <section className="taxonomy-panel privacy-panel">
        <header>
          <div><h2>Data Privacy</h2><p>These controls are enforced by the backend and cannot be weakened in the browser.</p></div>
          <span className="privacy-compliance"><LockKeyhole size={13} />Local-first policy</span>
        </header>
        <div className="privacy-options">
          <PrivacyStatus label="PII redaction before AI" detail="Names, contact details, direct identifiers and street addresses are removed locally before a remote request." enabled={status?.piiRedactionEnabled ?? true} />
          <PrivacyStatus label="Store extracted CV text in PostgreSQL" detail="Disabled by default. The original CV remains in protected local storage for evidence review." enabled={status?.extractedTextStored ?? false} expected={false} />
          <PrivacyStatus label="Verified zero data retention" detail={status?.retentionNotice ?? "Provider retention has not been verified."} enabled={status?.zeroRetentionVerified ?? false} />
        </div>
        <div className="privacy-audit">
          <ShieldCheck size={18} />
          <div><strong>{t("Current mode:")} {status?.privacyMode ?? t("Loading...")}</strong><span>{t(status?.remoteProcessing ? "Only locally redacted professional evidence is sent for remote processing." : "AI processing stays on this machine.")}</span></div>
          <Link href="/admin/audit-logs">{t("View audit log")} <ChevronRight size={13} /></Link>
        </div>
      </section>

      <section className="taxonomy-panel retention-panel">
        <header>
          <div><h2>Local CV Retention</h2><p>Delete expired source files from protected local storage while preserving grounded results and audit history.</p></div>
          <span className="privacy-compliance"><LockKeyhole size={13} />{retention ? `${retention.retentionDays} ${t("days")}` : t("Loading...")}</span>
        </header>
        <div className="retention-metrics">
          <div><span>Available local files</span><strong>{retention?.availableLocalFiles ?? "-"}</strong></div>
          <div><span>Eligible for deletion</span><strong>{retention?.eligibleFiles ?? "-"}</strong></div>
          <div><span>Eligible storage</span><strong>{formatBytes(retention?.eligibleBytes ?? 0)}</strong></div>
        </div>
        <div className="retention-action">
          <span><strong>Manual confirmation required</strong><small>Only files inside this project&apos;s uploads folder and older than the retention cutoff can be deleted.</small></span>
          <button className="button danger" type="button" disabled={purging || !retention?.eligibleFiles} onClick={onPurge}><Trash2 size={14} />{purging ? "Deleting..." : "Delete expired files"}</button>
        </div>
      </section>
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function PrivacyStatus({ label, detail, enabled, expected = true }: { label: string; detail: string; enabled: boolean; expected?: boolean }) {
  const healthy = enabled === expected;
  return <div className="privacy-toggle"><span><strong>{label}</strong><small>{detail}</small></span><strong className={healthy ? "provider-status" : "status-disabled-text"}>{healthy ? "Protected" : "Not verified"}</strong></div>;
}
