import { AppShell } from "@/components/app-shell";

export function PlaceholderPage({
  activePath,
  breadcrumb,
  title,
  subtitle,
  primaryAction,
  modules
}: {
  activePath: string;
  breadcrumb: string;
  title: string;
  subtitle: string;
  primaryAction?: string;
  modules: string[];
}) {
  return (
    <AppShell activePath={activePath} breadcrumb={breadcrumb}>
      <section className="page-header">
        <div>
          <h1 className="page-title">{title}</h1>
          <p className="page-subtitle">{subtitle}</p>
        </div>
        {primaryAction ? <button className="button primary">{primaryAction}</button> : null}
      </section>

      <section className="placeholder-grid">
        <div className="card">
          <h2 className="card-title">Implementation Scope</h2>
          <ul className="placeholder-list">
            {modules.map((module) => (
              <li key={module}>{module}</li>
            ))}
          </ul>
        </div>
        <div className="card">
          <h2 className="card-title">API Contract</h2>
          <p className="page-subtitle">
            This route will be wired to the matching FastAPI endpoints and documented in docs/api/swagger.json.
          </p>
        </div>
      </section>
    </AppShell>
  );
}

