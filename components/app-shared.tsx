export type DatabaseKey = "jobseekers" | "research" | "biometrics";

export type AuthProfile = { id: string; full_name: string; username: string; email: string; role: "system_admin" | "dpo" | "office_focal" | "data_steward" | "staff"; status: "pending" | "active" | "rejected" | "suspended" };

export type AccountTab = "approvals" | "users";

export const databaseMeta: Record<DatabaseKey, { name: string; short: string; count: string; change: string; updated: string; color: string }> = {
  jobseekers: { name: "Jobseeker Registry", short: "JS", count: "1,592", change: "+4.8%", updated: "8 min ago", color: "#1e5aa8" },
  research: { name: "Research & Data Requests", short: "RD", count: "225", change: "+12.1%", updated: "26 min ago", color: "#0f766e" },
  biometrics: { name: "Biometrics Data", short: "BD", count: "2", change: "1 personnel", updated: "Sep 10, 2026", color: "#b45309" },
};

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: string }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description: string; actions?: React.ReactNode }) {
  return <><div className="page-header"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1><p>{description}</p></div>{actions && <div className="header-actions">{actions}</div>}</div></>;
}

export function ScreenLoading() {
  return <div className="empty-state" role="status">Loading…</div>;
}
