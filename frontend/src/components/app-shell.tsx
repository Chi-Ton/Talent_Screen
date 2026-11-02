"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Bell,
  Columns3,
  HelpCircle,
  ListOrdered,
  Menu,
  Search,
  Settings,
  UploadCloud,
  X
} from "lucide-react";
import { useRouter } from "next/navigation";
import { getAuthSession } from "@/lib/auth-storage";
import { LanguageToggle } from "@/components/language-toggle";
import { useLanguage } from "@/lib/language-provider";

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number }>;
  section?: string;
};

const navItems: NavItem[] = [
  { label: "Upload & Evaluate", href: "/screen", icon: UploadCloud },
  { label: "Results", href: "/results", icon: ListOrdered },
  { label: "Compare", href: "/compare", icon: Columns3 },
  { label: "Settings", href: "/settings", icon: Settings }
];

export function AppShell({
  activePath,
  breadcrumb,
  searchValue = "",
  onSearchChange,
  children
}: {
  activePath: string;
  breadcrumb: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { t } = useLanguage();
  const [authChecked, setAuthChecked] = useState(false);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);

  useEffect(() => {
    if (!getAuthSession()) {
      router.replace("/login");
      return;
    }
    setAuthChecked(true);
  }, [router]);

  if (!authChecked) return <div className="app-shell-loading" aria-live="polite">{t("Loading...")}</div>;

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Primary navigation">
        <Link className="brand" href="/screen">
          <span className="brand-mark">TS</span>
          <span>
            <strong>TalentScreen AI</strong>
            <span>Private HR Workspace</span>
          </span>
        </Link>

        <nav>
          {navItems.map((item) => (
            <div key={item.href}>
              {item.section ? <div className="nav-section">{item.section}</div> : null}
              <Link className={`nav-link ${activePath === item.href ? "active" : ""}`} href={item.href}>
                <item.icon size={17} />
                <span>{t(item.label)}</span>
              </Link>
            </div>
          ))}
        </nav>
      </aside>

      {mobileNavigationOpen ? <div className="mobile-nav-overlay" role="presentation" onClick={() => setMobileNavigationOpen(false)}><aside className="mobile-nav-drawer" aria-label="Mobile navigation" onClick={(event) => event.stopPropagation()}><header><Link className="brand" href="/screen" onClick={() => setMobileNavigationOpen(false)}><span className="brand-mark">TS</span><span><strong>TalentScreen AI</strong><span>{t("Private HR Workspace")}</span></span></Link><button type="button" aria-label={t("Close navigation")} onClick={() => setMobileNavigationOpen(false)}><X size={19} /></button></header><nav>{navItems.map((item) => <Link className={`nav-link ${activePath === item.href ? "active" : ""}`} href={item.href} key={item.href} onClick={() => setMobileNavigationOpen(false)}><item.icon size={18} /><span>{t(item.label)}</span></Link>)}</nav></aside></div> : null}

      <main className="main">
        <header className="topbar">
          <div className="topbar-leading"><button className="mobile-nav-trigger" type="button" aria-label={t("Open navigation")} aria-expanded={mobileNavigationOpen} onClick={() => setMobileNavigationOpen(true)}><Menu size={19} /></button><div className="breadcrumb">{t(breadcrumb)}</div></div>
          <div className="topbar-actions">
            <div style={{ position: "relative" }}>
              <Search aria-hidden size={16} style={{ left: 10, position: "absolute", top: 11 }} />
              <input
                className="search"
                aria-label={t("Global search")}
                placeholder={t("Search...")}
                value={searchValue}
                onChange={(event) => onSearchChange?.(event.target.value)}
                style={{ paddingLeft: 34 }}
                />
                </div>
                <button className="icon-button" aria-label={t("Notifications")}>
              <Bell size={17} />
            </button>
            <button className="icon-button" aria-label={t("Help")}>
              <HelpCircle size={17} />
            </button>
            <button className="profile-avatar" aria-label={t("User menu")}>SM</button>
          </div>
        </header>
        <div className="content">{children}</div>
      </main>
    </div>
  );
}
