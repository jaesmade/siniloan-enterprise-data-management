"use client";

import { useEffect, useState } from "react";
import {
  Archive, ArrowLeft, ArrowRight, Bell,
  Check, CheckCircle, Clock, Database, DownloadSimple, Eye,
  EyeSlash, FileArrowUp, Fingerprint, Funnel, Gauge, House, IdentificationCard, Pulse,
  List, Lock, MagnifyingGlass, MapPin, PencilSimple, Plus, ShieldCheck, SignOut,
  SlidersHorizontal, SpinnerGap, UserPlus, Users, DeviceMobile, WifiHigh, ArrowsClockwise,
  ClipboardText, PaperPlaneTilt, SealCheck,
  WarningCircle, X, XCircle,
} from "@phosphor-icons/react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";

type Screen = "login" | "register" | "pending" | "admin" | "databases" | "database" | "access" | "approvals" | "activity" | "import";
type Role = "DPO" | "Data Steward" | "Staff";
type DatabaseKey = "jobseekers" | "research" | "biometrics";
type AccessLevel = "none" | "read" | "write";

const databaseMeta: Record<DatabaseKey, { name: string; short: string; count: string; change: string; updated: string; color: string }> = {
  jobseekers: { name: "Jobseeker Registry", short: "JS", count: "1,592", change: "+4.8%", updated: "8 min ago", color: "#1e5aa8" },
  research: { name: "Research & Data Requests", short: "RD", count: "225", change: "+12.1%", updated: "26 min ago", color: "#0f766e" },
  biometrics: { name: "Biometrics Data", short: "BD", count: "2", change: "1 personnel", updated: "Sep 10, 2026", color: "#b45309" },
};

const activityItems = [
  { icon: PencilSimple, tone: "blue", title: "Jobseeker record updated", detail: "Mariel Santos edited employment status for JS-2026-0184", time: "4 min ago", database: "Jobseeker Registry" },
  { icon: CheckCircle, tone: "green", title: "Account access approved", detail: "DPO granted read-only access to Carlo Mendoza", time: "12 min ago", database: "Access Control" },
  { icon: ShieldCheck, tone: "purple", title: "Successful sign in", detail: "Angela Reyes signed in from the MDRRMO office", time: "18 min ago", database: "Authentication" },
  { icon: FileArrowUp, tone: "amber", title: "Import completed", detail: "42 research request records imported with 2 warnings", time: "26 min ago", database: "Research & Data Requests" },
  { icon: WarningCircle, tone: "red", title: "Failed sign-in attempt", detail: "Unrecognized credentials from 192.168.1.48", time: "31 min ago", database: "Authentication" },
  { icon: Plus, tone: "green", title: "Biometrics workbook imported", detail: "Two Agriculture Office attendance records were loaded", time: "1 hr ago", database: "Biometrics Data" },
];

const jobseekers = [
  { id: "JS-2026-0184", name: "Maria Angela Reyes", barangay: "Mendiola", status: "Employed", education: "College Graduate", updated: "Today, 9:42 AM" },
  { id: "JS-2026-0183", name: "John Paul Ramos", barangay: "Bagong Pag-asa", status: "Jobseeking", education: "Senior High School", updated: "Today, 9:18 AM" },
  { id: "JS-2026-0182", name: "Rica Mae Mendoza", barangay: "Kapatalan", status: "Self-employed", education: "Vocational", updated: "Yesterday, 4:31 PM" },
  { id: "JS-2026-0181", name: "Mark Anthony Cruz", barangay: "Halayhayin", status: "Jobseeking", education: "College Level", updated: "Yesterday, 3:06 PM" },
  { id: "JS-2026-0180", name: "Jenny Rose Dela Cruz", barangay: "Llavac", status: "Employed", education: "College Graduate", updated: "Sep 18, 2026" },
];

const biometricEvents = [
  { id: "BIO-18-0909", department: "AGRICULTURE OFFICE", person: "REALEZA, CARLO L.", personnelNo: "18", timestamp: "Sep 9, 2026 · 5:25:08 PM", status: "C/In", locationId: "101", idNumber: "PERMANENT", workcode: "0", verifyCode: "Fingerpint", cardNo: "—" },
  { id: "BIO-18-0910", department: "AGRICULTURE OFFICE", person: "REALEZA, CARLO L.", personnelNo: "18", timestamp: "Sep 10, 2026 · 7:43:35 AM", status: "C/In", locationId: "101", idNumber: "PERMANENT", workcode: "0", verifyCode: "Fingerpint", cardNo: "—" },
];

const biometricTrend = [
  { day: "Sep 9", events: 1 }, { day: "Sep 10", events: 1 },
];

const researchRequests = [
  { control: "RDR-2026-0225", requester: "Andrea M. Villanueva", institution: "Laguna State Polytechnic University", category: "Academic research", title: "Local employment trends among out-of-school youth", received: "Sep 20, 2026", status: "Under review", owner: "Carlo Mendoza" },
  { control: "RDR-2026-0224", requester: "Municipal Health Office", institution: "Municipality of Siniloan", category: "Inter-office", title: "Barangay health service utilization summary", received: "Sep 19, 2026", status: "Approved", owner: "Angela Reyes" },
  { control: "RDR-2026-0223", requester: "Paolo S. Garcia", institution: "University of the Philippines Los Baños", category: "Academic research", title: "Digital access and public service delivery", received: "Sep 18, 2026", status: "Needs information", owner: "Liza Torres" },
  { control: "RDR-2026-0222", requester: "Office of the Mayor", institution: "Municipality of Siniloan", category: "Executive report", title: "Municipal workforce and skills profile", received: "Sep 17, 2026", status: "Released", owner: "Carlo Mendoza" },
  { control: "RDR-2026-0221", requester: "Elena R. Cruz", institution: "Pamantasan ng Cabuyao", category: "Academic research", title: "Livelihood program outcomes in rural communities", received: "Sep 16, 2026", status: "Denied", owner: "Angela Reyes" },
];

const requestTrend = [
  { month: "Apr", received: 24, completed: 18 }, { month: "May", received: 31, completed: 25 },
  { month: "Jun", received: 27, completed: 24 }, { month: "Jul", received: 38, completed: 30 },
  { month: "Aug", received: 42, completed: 35 }, { month: "Sep", received: 36, completed: 28 },
];

const trend = [
  { month: "Apr", jobseekers: 1280, requests: 142, biometrics: 11 },
  { month: "May", jobseekers: 1334, requests: 158, biometrics: 14 },
  { month: "Jun", jobseekers: 1402, requests: 171, biometrics: 15 },
  { month: "Jul", jobseekers: 1468, requests: 189, biometrics: 17 },
  { month: "Aug", jobseekers: 1519, requests: 207, biometrics: 21 },
  { month: "Sep", jobseekers: 1592, requests: 225, biometrics: 23 },
];

function Seal() {
  return <div className="seal" aria-label="Municipality of Siniloan"><span>S</span></div>;
}

function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: string }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

function AuthShell({ children, step }: { children: React.ReactNode; step?: string }) {
  return (
    <main className="auth-layout">
      <section className="auth-brand">
        <div className="auth-brand-inner">
          <div className="brand-lockup"><Seal /><div><span>Municipality of Siniloan</span><strong>Enterprise Data Management</strong></div></div>
          <div className="auth-message">
            <Badge tone="blue"><ShieldCheck weight="fill" /> Secure government system</Badge>
            <h1>One trusted place for municipal data.</h1>
            <p>Govern access, maintain reliable records, and understand activity across every municipal dataset.</p>
          </div>
          <div className="trust-row"><Lock weight="fill" /><span>Protected by role-based access and complete activity records</span></div>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-mobile-brand"><Seal /><strong>Siniloan EDM</strong></div>
        {step && <div className="auth-step">{step}</div>}
        {children}
        <p className="auth-footer">Authorized municipal personnel only<br />© 2026 Municipality of Siniloan</p>
      </section>
    </main>
  );
}

type AuthProfile = { id: string; full_name: string; username: string; email: string; role: "dpo" | "data_steward" | "staff"; status: "pending" | "active" | "rejected" | "suspended" };
type Department = { id: string; name: string };

function roleLabel(role: AuthProfile["role"]): Role {
  return role === "dpo" ? "DPO" : role === "data_steward" ? "Data Steward" : "Staff";
}

function Login({ navigate, onAuthenticated }: { navigate: (s: Screen) => void; onAuthenticated: (profile: AuthProfile) => void }) {
  const [visible, setVisible] = useState(false); const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setLoading(true); setError("");
    const form = new FormData(event.currentTarget); const username = String(form.get("username") ?? "").trim(); const password = String(form.get("password") ?? "");
    try {
      const response = await fetch("/api/auth/sign-in", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
      const payload = await response.json();
      if (!response.ok) { setError(payload.error ?? "We could not sign you in. Check your username and password."); return; }
      const supabase = createSupabaseClient(); const { data, error: signInError } = await supabase.auth.setSession({ access_token: payload.accessToken, refresh_token: payload.refreshToken });
      if (signInError || !data.user) { setError("We could not start your session. Please try again."); return; }
      const { data: profile, error: profileError } = await supabase.schema("core").from("profiles").select("id, full_name, username, email, role, status").eq("id", data.user.id).single();
      if (profileError || !profile) { setError("Your account profile is not ready. Please contact the Data Privacy Officer."); return; }
      if (profile.status !== "active") { navigate("pending"); return; }
      onAuthenticated(profile as AuthProfile);
    } catch { setError("Supabase is not available. Confirm the local services and environment variables are running."); } finally { setLoading(false); }
  };
  return <AuthShell><div className="auth-card"><div className="eyebrow">Welcome back</div><h2>Sign in to your account</h2><p className="supporting">Use your username and password registered with the municipal data portal.</p><form onSubmit={submit} className="form-stack"><label>Username<input name="username" type="text" autoComplete="username" placeholder="Enter your username" pattern="[A-Za-z0-9._-]{3,40}" required /></label><label>Password<div className="password-field"><input name="password" type={visible ? "text" : "password"} autoComplete="current-password" required /><button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? "Hide password" : "Show password"}>{visible ? <EyeSlash /> : <Eye />}</button></div></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button primary full" type="submit" disabled={loading}>{loading ? <><SpinnerGap className="spin" /> Signing in…</> : <>Sign in <ArrowRight /></>}</button></form><div className="auth-switch">Need an account? <button className="link-button" onClick={() => navigate("register")}>Request access</button></div></div></AuthShell>;
}

function Register({ navigate }: { navigate: (s: Screen) => void }) {
  const [step, setStep] = useState(1); const [departments, setDepartments] = useState<Department[]>([]); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  const [values, setValues] = useState({ fullName: "", username: "", email: "", departmentId: "", password: "", confirmPassword: "", consent: false });
  useEffect(() => { createSupabaseClient().schema("core").from("departments").select("id, name").eq("is_active", true).order("name").then(({ data }: { data: unknown }) => setDepartments((data ?? []) as Department[])); }, []);
  const continueToPassword = () => { if (!values.fullName || !values.username || !values.email || !values.departmentId) { setError("Complete every required field before continuing."); return; } setError(""); setStep(2); };
  const submit = async () => { if (values.password.length < 12) { setError("Use a password with at least 12 characters."); return; } if (values.password !== values.confirmPassword) { setError("Passwords do not match."); return; } if (!values.consent) { setError("Confirm that the submitted details are correct."); return; } setLoading(true); setError(""); try { const supabase = createSupabaseClient(); const { error: signUpError } = await supabase.auth.signUp({ email: values.email, password: values.password, options: { data: { full_name: values.fullName, username: values.username, department_id: values.departmentId } } }); if (signUpError) { setError(signUpError.message); return; } navigate("pending"); } catch { setError("Supabase is not available. Confirm the local services and environment variables are running."); } finally { setLoading(false); } };
  const update = (field: keyof typeof values, value: string | boolean) => setValues((current) => ({ ...current, [field]: value }));
  return <AuthShell step={`Account request · Step ${step} of 2`}><div className="auth-card wide"><button className="back-link" onClick={() => step === 1 ? navigate("login") : setStep(1)}><ArrowLeft /> Back</button>{step === 1 ? <><div className="eyebrow">Request access</div><h2>Tell us about yourself</h2><p className="supporting">Your details will be reviewed by the Data Privacy Officer.</p><div className="form-grid"><label className="span-2">Full name<input value={values.fullName} onChange={(event) => update("fullName", event.target.value)} autoComplete="name" required /></label><label>Username<input value={values.username} onChange={(event) => update("username", event.target.value)} autoComplete="username" required /></label><label>Email address<input type="email" value={values.email} onChange={(event) => update("email", event.target.value)} autoComplete="email" required /></label><label className="span-2">Department<select value={values.departmentId} onChange={(event) => update("departmentId", event.target.value)} required><option value="" disabled>{departments.length ? "Select your department" : "Loading departments…"}</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label></div>{error && <p className="form-error" role="alert">{error}</p>}<button className="button primary full" onClick={continueToPassword}>Continue <ArrowRight /></button></> : <><div className="eyebrow">Secure your account</div><h2>Create a password</h2><p className="supporting">Use at least 12 characters. You can use a password manager.</p><div className="form-stack"><label>Password<input type="password" value={values.password} onChange={(event) => update("password", event.target.value)} autoComplete="new-password" required /></label><label>Confirm password<input type="password" value={values.confirmPassword} onChange={(event) => update("confirmPassword", event.target.value)} autoComplete="new-password" required /></label></div><div className="password-rules"><span className={values.password.length >= 12 ? "met" : ""}><Check /> 12+ characters</span><span className={values.password === values.confirmPassword && values.password ? "met" : ""}><Check /> Passwords match</span></div><label className="consent"><input type="checkbox" checked={values.consent} onChange={(event) => update("consent", event.target.checked)} /> <span>I confirm these details are correct and understand that access is subject to DPO approval.</span></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button primary full" onClick={submit} disabled={loading}>{loading ? <><SpinnerGap className="spin" /> Submitting…</> : <>Submit request <ArrowRight /></>}</button></>}</div></AuthShell>;
}

function Pending({ navigate }: { navigate: (s: Screen) => void }) {
  return <AuthShell><div className="status-card"><div className="status-icon"><Clock weight="fill" /></div><Badge tone="amber">Pending review</Badge><h2>Your request has been submitted</h2><p>The Data Privacy Officer will verify your account and assign access to the appropriate databases.</p><div className="request-summary"><div><span>Request number</span><strong>ACC-2026-0047</strong></div><div><span>Submitted</span><strong>September 20, 2026</strong></div><div><span>Department</span><strong>Municipal Planning & Development</strong></div></div><div className="next-steps"><strong>What happens next?</strong><ol><li><span>1</span>DPO verifies your identity and department</li><li><span>2</span>DPO assigns database access and permissions</li><li><span>3</span>You can sign in when your account is active</li></ol></div><button className="button secondary full" onClick={() => navigate("login")}><ArrowLeft /> Return to sign in</button></div></AuthShell>;
}

const navItems: { screen: Screen; label: string; icon: typeof House; roles?: Role[] }[] = [
  { screen: "admin", label: "Admin overview", icon: Gauge, roles: ["DPO", "Data Steward"] },
  { screen: "databases", label: "My databases", icon: Database },
  { screen: "approvals", label: "Account approvals", icon: UserPlus, roles: ["DPO"] },
  { screen: "access", label: "Users & access", icon: Users, roles: ["DPO"] },
  { screen: "activity", label: "System activity", icon: Pulse, roles: ["DPO", "Data Steward"] },
  { screen: "import", label: "Imports", icon: FileArrowUp },
];

function AppShell({ screen, setScreen, role, selectedDatabase, openDatabase, children, onSignOut }: { screen: Screen; setScreen: (s: Screen) => void; role: Role; selectedDatabase: DatabaseKey; openDatabase: (key: DatabaseKey) => void; children: React.ReactNode; onSignOut: () => void }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return <div className="app-shell">
    <a href="#main-content" className="skip-link">Skip to main content</a>
    <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
      <div className="sidebar-brand"><Seal /><div><strong>Siniloan EDM</strong><span>Enterprise Data Management</span></div><button className="mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X /></button></div>
      <nav aria-label="Main navigation">
        <div className="nav-label">Workspace</div>
        {navItems.filter(i => !i.roles || i.roles.includes(role)).map(item => <button key={item.screen} className={screen === item.screen ? "active" : ""} onClick={() => { setScreen(item.screen); setMobileOpen(false); }}><item.icon /><span>{item.label}</span>{item.screen === "approvals" && <em>3</em>}</button>)}
        <div className="nav-label">Databases</div>
        {(Object.keys(databaseMeta) as DatabaseKey[]).map(key => <button key={key} className={screen === "database" && selectedDatabase === key ? "subtle-active database-active" : ""} onClick={() => { openDatabase(key); setMobileOpen(false); }}><span className="db-dot" style={{ background: databaseMeta[key].color }} /> <span>{databaseMeta[key].name}</span></button>)}
      </nav>
      <div className="sidebar-footer"><div className="role-switch"><label>Account role<span className="current-role">{role}</span></label></div><div className="user-chip"><div className="avatar">AR</div><div><strong>Signed-in account</strong><span>{role}</span></div><button aria-label="Sign out" onClick={onSignOut}><SignOut /></button></div></div>
    </aside>
    {mobileOpen && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
    <div className="app-main"><header className="topbar"><button className="menu-button" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><List /></button><div className="top-search"><MagnifyingGlass /><input aria-label="Search all databases" placeholder="Search records, people, or requests…" /><kbd>⌘ K</kbd></div><div className="top-actions"><button aria-label="Notifications" className="icon-button"><Bell /><span className="notify-dot" /></button><button className="help-button">Help & support</button></div></header><main id="main-content">{children}</main></div>
  </div>;
}

function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description: string; actions?: React.ReactNode }) {
  return <div className="page-header"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1><p>{description}</p></div>{actions && <div className="header-actions">{actions}</div>}</div>;
}

// Retained while the live Supabase views progressively replace preview-only views.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function AdminDashboard({ setScreen, role, openDatabase }: { setScreen: (s: Screen) => void; role: Role; openDatabase: (key: DatabaseKey) => void }) {
  return <div className="page"><PageHeader eyebrow="Sunday, September 20" title={`Good morning, Angela`} description="Here’s what is happening across the municipal data system." actions={<><button className="button secondary"><DownloadSimple /> Export overview</button>{role === "DPO" && <button className="button primary" onClick={() => setScreen("approvals")}><UserPlus /> Review 3 accounts</button>}</>} />
    <section className="alert-strip"><div><ShieldCheck weight="fill" /><span><strong>System health is good.</strong> All databases are available and the latest backup completed at 2:00 AM.</span></div><button>View system status <ArrowRight /></button></section>
    <section aria-labelledby="data-overview"><div className="section-heading"><div><h2 id="data-overview">Data overview</h2><p>Current record volume across all databases</p></div><button className="text-action" onClick={() => setScreen("databases")}>View all databases <ArrowRight /></button></div>
      <div className="metric-grid">{(Object.keys(databaseMeta) as DatabaseKey[]).map((key, index) => { const db = databaseMeta[key]; const Icon = [IdentificationCard, Archive, Fingerprint][index]; return <button key={key} className="metric-card" onClick={() => openDatabase(key)}><div className="metric-top"><span className="metric-icon" style={{ background: `${db.color}14`, color: db.color }}><Icon weight="duotone" /></span><Badge tone={index === 1 ? "green" : index === 2 ? "amber" : "blue"}>{db.change}</Badge></div><span>{db.name}</span><strong>{db.count}</strong><small>Total records · Updated {db.updated}</small><div className="metric-link">Open database <ArrowRight /></div></button> })}</div>
    </section>
    <div className="dashboard-grid">
      <section className="panel chart-panel"><div className="panel-header"><div><h2>Records over time</h2><p>Six-month cumulative volume</p></div><select aria-label="Chart period"><option>Last 6 months</option><option>Last 12 months</option></select></div><div className="chart-legend"><span><i style={{ background: "#1e5aa8" }} />Jobseekers</span><span><i style={{ background: "#0f766e" }} />Research requests</span><span><i style={{ background: "#b45309" }} />Biometrics</span></div><div className="chart-wrap" role="img" aria-label="Dataset records from April to September"><ResponsiveContainer width="100%" height={270}><AreaChart data={trend} margin={{ left: -18, right: 12 }}><defs><linearGradient id="jobFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1e5aa8" stopOpacity={.2}/><stop offset="1" stopColor="#1e5aa8" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e6eaf0"/><XAxis dataKey="month" axisLine={false} tickLine={false}/><YAxis axisLine={false} tickLine={false}/><Tooltip/><Area type="monotone" dataKey="jobseekers" stroke="#1e5aa8" strokeWidth={2.5} fill="url(#jobFill)"/><Area type="monotone" dataKey="requests" stroke="#0f766e" strokeWidth={2.5} fill="transparent"/><Area type="monotone" dataKey="biometrics" stroke="#b45309" strokeWidth={2.5} fill="transparent"/></AreaChart></ResponsiveContainer></div></section>
      <section className="panel activity-panel"><div className="panel-header"><div><h2>Recent system activity</h2><p>Across data and account security</p></div><button className="icon-button" aria-label="Filter activity"><Funnel /></button></div><ActivityList items={activityItems.slice(0,5)} /><button className="panel-footer-action" onClick={() => setScreen("activity")}>View all activity <ArrowRight /></button></section>
    </div>
    <div className="dashboard-grid lower"><section className="panel"><div className="panel-header"><div><h2>Data quality</h2><p>Automated checks across databases</p></div></div><div className="quality-body"><div className="quality-score"><ResponsiveContainer width={130} height={130}><PieChart><Pie data={[{ value: 96 },{ value: 4 }]} innerRadius={48} outerRadius={60} startAngle={90} endAngle={-270} dataKey="value" stroke="none"><Cell fill="#18794e"/><Cell fill="#e8ecef"/></Pie></PieChart></ResponsiveContainer><div><strong>96%</strong><span>Healthy</span></div></div><div className="quality-list"><div><span><i className="green" />Complete records</span><strong>1,813</strong></div><div><span><i className="amber" />Needs review</span><strong>114</strong></div><div><span><i className="red" />Possible duplicates</span><strong>20</strong></div></div></div></section>
      <section className="panel"><div className="panel-header"><div><h2>Access review</h2><p>Accounts requiring attention</p></div></div><div className="access-summary"><div><span className="summary-icon amber"><Clock /></span><div><strong>3 pending requests</strong><span>Oldest waiting for 2 days</span></div><button onClick={() => setScreen("approvals")}>Review</button></div><div><span className="summary-icon blue"><Users /></span><div><strong>42 active accounts</strong><span>8 departments represented</span></div><button onClick={() => setScreen("access")}>Manage</button></div><div><span className="summary-icon green"><ShieldCheck /></span><div><strong>Access review current</strong><span>Next review due Oct 1</span></div><button>Details</button></div></div></section>
    </div>
  </div>;
}

function ActivityList({ items = activityItems }: { items?: typeof activityItems }) {
  return <div className="activity-list">{items.map((item, i) => <div className="activity-item" key={i}><span className={`activity-icon ${item.tone}`}><item.icon weight="duotone" /></span><div><strong>{item.title}</strong><p>{item.detail}</p><span>{item.database} · {item.time}</span></div></div>)}</div>;
}

function Databases({ openDatabase, importDatabase }: { openDatabase: (key: DatabaseKey) => void; importDatabase: (key: DatabaseKey) => void }) {
  return <div className="page"><PageHeader eyebrow="Workspace" title="My databases" description="Open the datasets you have permission to view or manage." />
    <div className="database-grid">{(Object.keys(databaseMeta) as DatabaseKey[]).map((key, i) => { const db = databaseMeta[key]; const Icon = [IdentificationCard, Archive, Fingerprint][i]; return <article className="database-card" key={key}><div className="db-card-head"><span style={{ color: db.color, background: `${db.color}14` }}><Icon weight="duotone" /></span><Badge tone={i === 1 ? "green" : "blue"}>{i === 1 ? "Read only" : "Read/write"}</Badge></div><h2>{db.name}</h2><p>{i === 0 ? "Employment profiles, qualifications, training and work preferences." : i === 1 ? "Requests, research purposes, reviews and controlled releases." : "Biometric attendance records, personnel, locations, and verification data."}</p><div className="db-card-meta"><div><strong>{db.count}</strong><span>records</span></div><div><strong>{db.updated}</strong><span>last updated</span></div></div><button className="button primary full" onClick={() => importDatabase(key)}><FileArrowUp /> Import data</button><button className="button secondary full" onClick={() => openDatabase(key)}>Open database <ArrowRight /></button></article>})}</div>
  </div>;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function DatabaseDashboard({ setScreen }: { setScreen: (s: Screen) => void }) {
  const [tab, setTab] = useState("Overview");
  const [query, setQuery] = useState("");
  const filtered = jobseekers.filter(x => x.name.toLowerCase().includes(query.toLowerCase()) || x.id.toLowerCase().includes(query.toLowerCase()));
  return <div className="page"><div className="breadcrumb"><button onClick={() => setScreen("databases")}>My databases</button><span>/</span><span>Jobseeker Registry</span></div><PageHeader title="Jobseeker Registry" description="Employment profiles, qualifications, training and work preferences." actions={<><Badge tone="blue"><PencilSimple /> Read/write access</Badge><button className="button secondary"><DownloadSimple /> Export</button><button className="button primary"><Plus /> Add record</button></>} />
    <div className="tabs" role="tablist">{["Overview","Records","Recent activity","Data quality"].map(x => <button key={x} role="tab" aria-selected={tab === x} className={tab === x ? "active" : ""} onClick={() => setTab(x)}>{x}</button>)}</div>
    {tab === "Overview" && <><div className="compact-metrics"><div><span>Total records</span><strong>1,592</strong><small><b>+73</b> this month</small></div><div><span>Active jobseekers</span><strong>684</strong><small>43% of records</small></div><div><span>With training</span><strong>928</strong><small>58% of records</small></div><div><span>Data completeness</span><strong>96.2%</strong><small><b>+1.4%</b> this quarter</small></div></div><div className="dashboard-grid"><section className="panel chart-panel"><div className="panel-header"><div><h2>Registrations by month</h2><p>New jobseeker profiles added</p></div><select><option>Last 6 months</option></select></div><div className="chart-wrap"><ResponsiveContainer width="100%" height={250}><BarChart data={trend} margin={{ left: -20 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e6eaf0"/><XAxis dataKey="month" axisLine={false} tickLine={false}/><YAxis axisLine={false} tickLine={false}/><Tooltip/><Bar dataKey="jobseekers" fill="#1e5aa8" radius={[5,5,0,0]} /></BarChart></ResponsiveContainer></div></section><section className="panel activity-panel"><div className="panel-header"><div><h2>Recent activity</h2><p>Changes in this database</p></div></div><ActivityList items={activityItems.filter(x => x.database === "Jobseeker Registry").concat(activityItems.slice(0,2))} /><button className="panel-footer-action" onClick={() => setTab("Recent activity")}>View all activity <ArrowRight /></button></section></div></>}
    {tab === "Records" && <section className="panel table-panel"><div className="table-toolbar"><div className="table-search"><MagnifyingGlass /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by name or record ID" /></div><button className="button secondary"><Funnel /> Filters</button><button className="button secondary"><SlidersHorizontal /> Columns</button></div><div className="table-scroll"><table><thead><tr><th><input type="checkbox" aria-label="Select all" /></th><th>Record ID</th><th>Name</th><th>Barangay</th><th>Employment</th><th>Education</th><th>Updated</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{filtered.map(row => <tr key={row.id}><td><input type="checkbox" aria-label={`Select ${row.name}`} /></td><td><strong className="record-id">{row.id}</strong></td><td><div className="person-cell"><span>{row.name.split(" ").map(x=>x[0]).slice(0,2).join("")}</span><strong>{row.name}</strong></div></td><td>{row.barangay}</td><td><Badge tone={row.status === "Jobseeking" ? "amber" : "green"}>{row.status}</Badge></td><td>{row.education}</td><td>{row.updated}</td><td><button className="icon-button" aria-label={`Edit ${row.name}`}><PencilSimple /></button></td></tr>)}</tbody></table></div><div className="pagination"><span>Showing 1–5 of 1,592 records</span><div><button disabled><ArrowLeft /></button><button className="active">1</button><button>2</button><button>3</button><button><ArrowRight /></button></div></div></section>}
    {tab === "Recent activity" && <section className="panel activity-full"><div className="activity-filters"><select><option>All actions</option><option>Created</option><option>Updated</option><option>Imported</option></select><input type="date" aria-label="Activity start date" /><button className="button secondary"><Funnel /> Apply filters</button></div><ActivityList /></section>}
    {tab === "Data quality" && <section className="quality-page"><div className="quality-hero"><CheckCircle weight="fill" /><div><h2>Database health: 96.2%</h2><p>Most records pass the current completeness and consistency checks.</p></div><button className="button secondary">Run checks</button></div><div className="quality-cards"><div><WarningCircle /><strong>38</strong><span>Missing contact details</span><button>Review records</button></div><div><Users /><strong>12</strong><span>Possible duplicates</span><button>Compare records</button></div><div><Clock /><strong>9</strong><span>Outdated profiles</span><button>Review records</button></div></div></section>}
  </div>;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ResearchDashboard({ setScreen }: { setScreen: (s: Screen) => void }) {
  const [tab, setTab] = useState("Overview");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All statuses");
  const filteredRequests = researchRequests.filter(request => {
    const matchesQuery = `${request.control} ${request.requester} ${request.institution} ${request.title}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (status === "All statuses" || request.status === status);
  });
  const statusTone = (value: string) => value === "Approved" || value === "Released" ? "green" : value === "Denied" ? "red" : value === "Under review" ? "blue" : "amber";
  const researchActivity = [
    { icon: SealCheck, tone: "green", title: "Request approved", detail: "RDR-2026-0224 was approved for summarized health-service data", time: "26 min ago", database: "Research & Data Requests" },
    { icon: FileArrowUp, tone: "blue", title: "Supporting document added", detail: "Andrea Villanueva attached an endorsed research protocol", time: "1 hr ago", database: "Research & Data Requests" },
    { icon: PaperPlaneTilt, tone: "purple", title: "Dataset released", detail: "RDR-2026-0222 release package was downloaded by the requester", time: "Yesterday, 3:42 PM", database: "Research & Data Requests" },
    { icon: PencilSimple, tone: "amber", title: "More information requested", detail: "RDR-2026-0223 needs a revised data-use statement", time: "Yesterday, 11:16 AM", database: "Research & Data Requests" },
  ];
  return <div className="page research-page">
    <div className="breadcrumb"><button onClick={() => setScreen("databases")}>My databases</button><span>/</span><span>Research & Data Requests</span></div>
    <PageHeader title="Research & Data Requests" description="Receive, review, approve, and track controlled requests for municipal data." actions={<><Badge tone="green"><Eye /> Read-only source access</Badge><button className="button secondary"><DownloadSimple /> Export register</button><button className="button primary"><Plus /> New request</button></>} />
    <div className="tabs" role="tablist" aria-label="Research and data request sections">{["Overview","Requests","Recent activity","Data quality"].map(item => <button key={item} role="tab" aria-selected={tab === item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>)}</div>

    {tab === "Overview" && <>
      <div className="compact-metrics research-metrics"><div><span>Total requests</span><strong>225</strong><small><b>+18</b> this month</small></div><div><span>Under review</span><strong>12</strong><small>4 due this week</small></div><div><span>Awaiting information</span><strong>6</strong><small>Requester action needed</small></div><div><span>Released this month</span><strong>28</strong><small><b>78%</b> completion rate</small></div></div>
      <div className="workflow-strip" aria-label="Request workflow"><div className="active"><span>36</span><strong>Received</strong></div><ArrowRight/><div><span>12</span><strong>Under review</strong></div><ArrowRight/><div><span>31</span><strong>Decided</strong></div><ArrowRight/><div><span>28</span><strong>Released</strong></div><ArrowRight/><div><span>26</span><strong>Closed</strong></div></div>
      <div className="dashboard-grid">
        <section className="panel chart-panel"><div className="panel-header"><div><h2>Request volume</h2><p>Received and completed requests by month</p></div><select aria-label="Research request chart period"><option>Last 6 months</option><option>Last 12 months</option></select></div><div className="chart-legend"><span><i style={{background:"#0f766e"}}/>Received</span><span><i style={{background:"#7aaea8"}}/>Completed</span></div><div className="chart-wrap" role="img" aria-label="Requests received peaked at 42 in August while completed requests peaked at 35"><ResponsiveContainer width="100%" height={260}><AreaChart data={requestTrend} margin={{left:-22,right:10}}><defs><linearGradient id="researchFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0f766e" stopOpacity={.2}/><stop offset="1" stopColor="#0f766e" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e6eaf0"/><XAxis dataKey="month" axisLine={false} tickLine={false}/><YAxis axisLine={false} tickLine={false}/><Tooltip/><Area type="monotone" dataKey="received" stroke="#0f766e" strokeWidth={2.5} fill="url(#researchFill)"/><Area type="monotone" dataKey="completed" stroke="#7aaea8" strokeWidth={2.5} fill="transparent"/></AreaChart></ResponsiveContainer></div></section>
        <section className="panel review-due-panel"><div className="panel-header"><div><h2>Request priorities</h2><p>Requests needing attention</p></div><button className="text-action" onClick={() => setTab("Requests")}>View requests <ArrowRight/></button></div><div className="priority-list"><div><span className="priority-date urgent"><strong>20</strong>SEP</span><div><strong>RDR-2026-0225</strong><p>Local employment trends among out-of-school youth</p><small>Due today · Academic research</small></div><Badge tone="red">High</Badge></div><div><span className="priority-date"><strong>22</strong>SEP</span><div><strong>RDR-2026-0223</strong><p>Digital access and public service delivery</p><small>Waiting for revised statement</small></div><Badge tone="amber">Waiting</Badge></div><div><span className="priority-date"><strong>24</strong>SEP</span><div><strong>RDR-2026-0219</strong><p>Municipal agricultural productivity dataset</p><small>Assigned to Carlo Mendoza</small></div><Badge tone="blue">Normal</Badge></div></div></section>
      </div>
      <div className="dashboard-grid lower"><section className="panel"><div className="panel-header"><div><h2>Requests by category</h2><p>Current register distribution</p></div></div><div className="category-list"><div><span><i style={{background:"#0f766e"}}/>Academic research</span><strong>112 <small>50%</small></strong></div><div><span><i style={{background:"#1e5aa8"}}/>Inter-office</span><strong>61 <small>27%</small></strong></div><div><span><i style={{background:"#b45309"}}/>Executive report</span><strong>34 <small>15%</small></strong></div><div><span><i style={{background:"#6941c6"}}/>Public information</span><strong>18 <small>8%</small></strong></div></div></section><section className="panel activity-panel"><div className="panel-header"><div><h2>Recent activity</h2><p>Requests, reviews, and releases</p></div></div><ActivityList items={researchActivity.slice(0,3)}/><button className="panel-footer-action" onClick={() => setTab("Recent activity")}>View all activity <ArrowRight/></button></section></div>
    </>}

    {tab === "Requests" && <section className="panel table-panel"><div className="table-toolbar"><div className="table-search"><MagnifyingGlass/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search control number, requester, institution, or title" aria-label="Search research and data requests"/></div><select value={status} onChange={event=>setStatus(event.target.value)} aria-label="Filter requests by status"><option>All statuses</option><option>Under review</option><option>Needs information</option><option>Approved</option><option>Released</option><option>Denied</option></select><button className="button secondary"><Funnel/> More filters</button><button className="button secondary"><SlidersHorizontal/> Columns</button></div><div className="table-scroll"><table className="research-table"><thead><tr><th>Control no.</th><th>Requester</th><th>Institution / office</th><th>Research title / purpose</th><th>Category</th><th>Date received</th><th>Status</th><th>Assigned to</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{filteredRequests.map(request=><tr key={request.control}><td><strong className="record-id">{request.control}</strong></td><td><strong>{request.requester}</strong></td><td>{request.institution}</td><td className="title-cell">{request.title}</td><td>{request.category}</td><td>{request.received}</td><td><Badge tone={statusTone(request.status)}>{request.status}</Badge></td><td>{request.owner}</td><td><button className="icon-button" aria-label={`View ${request.control}`}><Eye/></button></td></tr>)}</tbody></table></div><div className="pagination"><span>Showing {filteredRequests.length} of 225 requests</span><div><button disabled><ArrowLeft/></button><button className="active">1</button><button>2</button><button>3</button><button><ArrowRight/></button></div></div></section>}

    {tab === "Recent activity" && <section className="panel activity-full"><div className="activity-filters"><select aria-label="Research activity type"><option>All actions</option><option>Reviews</option><option>Decisions</option><option>Releases</option></select><select aria-label="Research activity outcome"><option>All outcomes</option><option>Approved</option><option>Denied</option><option>Released</option></select><input type="date" aria-label="Research activity start date"/><button className="button secondary"><Funnel/> Apply filters</button></div><ActivityList items={researchActivity.concat(activityItems.filter(item=>item.database==="Research & Data Requests"))}/></section>}

    {tab === "Data quality" && <section className="quality-page"><div className="quality-hero research-quality"><CheckCircle weight="fill"/><div><h2>Request register health: 97.3%</h2><p>219 of 225 source records have complete control numbers, requester details, purposes, and received dates.</p></div><button className="button secondary">Run checks</button></div><div className="quality-cards"><div><WarningCircle/><strong>4</strong><span>Missing control numbers</span><button>Review records</button></div><div><ClipboardText/><strong>2</strong><span>Incomplete research purposes</span><button>Complete details</button></div><div><Users/><strong>0</strong><span>Possible duplicate requests</span><button>View matching rules</button></div></div><section className="panel quality-rules"><div className="panel-header"><div><h2>Automated quality rules</h2><p>Checks covering the original seven workbook fields</p></div></div><div><p><CheckCircle/> Received date is present and valid <Badge tone="green">225 passed</Badge></p><p><WarningCircle/> Control number is present and unique <Badge tone="amber">4 review</Badge></p><p><CheckCircle/> Requester and institution are identified <Badge tone="green">225 passed</Badge></p><p><WarningCircle/> Research title or purpose is sufficiently detailed <Badge tone="amber">2 review</Badge></p></div></section></section>}
  </div>;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function BiometricsDashboard({ setScreen }: { setScreen: (s: Screen) => void }) {
  const [tab, setTab] = useState("Overview");
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("All locations");
  const filteredEvents = biometricEvents.filter(event => {
    const matchesQuery = `${event.id} ${event.person} ${event.department} ${event.personnelNo} ${event.locationId}`.toLowerCase().includes(query.toLowerCase());
    const matchesLocation = location === "All locations" || event.locationId === location;
    return matchesQuery && matchesLocation;
  });
  const biometricsActivity = [
    { icon: FileArrowUp, tone: "green", title: "Biometrics workbook imported", detail: "Two Agriculture Office attendance events were loaded", time: "Sep 10, 2026", database: "Biometrics Data" },
    { icon: ArrowsClockwise, tone: "blue", title: "Source location synchronized", detail: "Location ID 101 supplied two fingerprint records", time: "Sep 10, 2026", database: "Biometrics Data" },
  ];
  return <div className="page biometrics-page">
    <div className="breadcrumb"><button onClick={() => setScreen("databases")}>My databases</button><span>/</span><span>Biometrics Data</span></div>
    <PageHeader title="Biometrics Data" description="Biometric device events, personnel identifiers, locations, and synchronization status." actions={<><Badge tone="blue"><PencilSimple /> Read/write access</Badge><button className="button secondary"><DownloadSimple /> Export events</button><button className="button primary"><FileArrowUp /> Import events</button></>} />
    <div className="privacy-callout"><ShieldCheck weight="fill" /><div><strong>Restricted operational data</strong><p>This preview shows event and device metadata. It does not display or store fingerprint images, facial images, or biometric templates.</p></div><button>View handling policy</button></div>
    <div className="tabs" role="tablist" aria-label="Biometrics database sections">{["Overview","Device events","Personnel","Devices & locations","Recent activity","Data quality"].map(item => <button key={item} role="tab" aria-selected={tab === item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>)}</div>

    {tab === "Overview" && <>
      <div className="compact-metrics biometrics-metrics"><div><span>Attendance events</span><strong>2</strong><small>From the uploaded workbook</small></div><div><span>Personnel represented</span><strong>1</strong><small>Agriculture Office</small></div><div><span>Source locations</span><strong>1</strong><small>Location ID 101</small></div><div><span>Verification method</span><strong>1</strong><small>Fingerprint in source file</small></div></div>
      <div className="device-status-strip"><div><span className="device-status-icon"><WifiHigh weight="duotone" /></span><div><strong>Workbook import is current</strong><p>Latest attendance event is dated September 10, 2026 at 7:43:35 AM.</p></div></div><button onClick={() => setTab("Device events")}>View records <ArrowRight /></button></div>
      <div className="dashboard-grid">
        <section className="panel chart-panel"><div className="panel-header"><div><h2>Attendance events</h2><p>Records by date in the uploaded workbook</p></div><select aria-label="Biometrics chart period"><option>Current import</option></select></div><div className="chart-wrap" role="img" aria-label="One event on September 9 and one on September 10"><ResponsiveContainer width="100%" height={260}><BarChart data={biometricTrend} margin={{ left: -24, right: 8, top: 14 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e6eaf0"/><XAxis dataKey="day" axisLine={false} tickLine={false}/><YAxis allowDecimals={false} axisLine={false} tickLine={false}/><Tooltip/><Bar dataKey="events" fill="#b45309" radius={[5,5,0,0]} maxBarSize={40}/></BarChart></ResponsiveContainer></div></section>
        <section className="panel activity-panel"><div className="panel-header"><div><h2>Recent activity</h2><p>Changes and device synchronization</p></div></div><ActivityList items={biometricsActivity.slice(0,3)} /><button className="panel-footer-action" onClick={() => setTab("Recent activity")}>View all activity <ArrowRight /></button></section>
      </div>
      <div className="dashboard-grid lower">
        <section className="panel"><div className="panel-header"><div><h2>Events by location</h2><p>Current source distribution</p></div></div><div className="location-breakdown"><div><span><MapPin /> Location ID 101</span><strong>2 <small>100%</small></strong><i><b style={{width:"100%"}} /></i></div></div></section>
        <section className="panel"><div className="panel-header"><div><h2>Verification summary</h2><p>Method recorded in the source workbook</p></div></div><div className="verification-summary"><div className="verification-ring"><ResponsiveContainer width={120} height={120}><PieChart><Pie data={[{value:2}]} innerRadius={43} outerRadius={55} startAngle={90} endAngle={-270} dataKey="value" stroke="none"><Cell fill="#18794e"/></Pie></PieChart></ResponsiveContainer><span><strong>100%</strong><small>Fingerprint</small></span></div><div><p><i className="green" />Fingerprint events <strong>2</strong></p><p><i className="amber" />Card numbers present <strong>0</strong></p></div></div></section>
      </div>
    </>}

    {tab === "Device events" && <section className="panel table-panel"><div className="table-toolbar"><div className="table-search"><MagnifyingGlass /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search name, department, number, or location" aria-label="Search biometric attendance events" /></div><select value={location} onChange={event => setLocation(event.target.value)} aria-label="Filter events by location"><option>All locations</option><option>101</option></select><button className="button secondary"><Funnel /> More filters</button><button className="button secondary"><SlidersHorizontal /> Columns</button></div><div className="table-scroll"><table><thead><tr><th>Department</th><th>Name</th><th>No.</th><th>Date/Time</th><th>Status</th><th>Location ID</th><th>ID Number</th><th>Workcode</th><th>VerifyCode</th><th>CardNo</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{filteredEvents.map(event => <tr key={event.id}><td>{event.department}</td><td><div className="person-cell"><span>{event.person.split(/[ ,]+/).map(part=>part[0]).slice(0,2).join("")}</span><strong>{event.person}</strong></div></td><td><strong className="record-id">{event.personnelNo}</strong></td><td>{event.timestamp}</td><td><Badge tone="green"><CheckCircle />{event.status}</Badge></td><td><span className="device-id">{event.locationId}</span></td><td>{event.idNumber}</td><td>{event.workcode}</td><td>{event.verifyCode}</td><td>{event.cardNo}</td><td><button className="icon-button" aria-label={`View ${event.id}`}><Eye /></button></td></tr>)}</tbody></table></div><div className="pagination"><span>Showing {filteredEvents.length} of 2 attendance records</span><div><button disabled><ArrowLeft /></button><button className="active">1</button><button disabled><ArrowRight /></button></div></div></section>}

    {tab === "Personnel" && <section className="panel table-panel"><div className="table-toolbar"><div className="table-search"><MagnifyingGlass /><input placeholder="Search personnel" aria-label="Search biometrics personnel" /></div><button className="button secondary"><Funnel /> Department</button><button className="button primary"><Plus /> Add personnel</button></div><div className="table-scroll"><table><thead><tr><th>No.</th><th>Name</th><th>Department</th><th>ID number</th><th>Card number</th><th>Latest event</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody><tr><td><strong className="record-id">18</strong></td><td><div className="person-cell"><span>RC</span><strong>REALEZA, CARLO L.</strong></div></td><td>AGRICULTURE OFFICE</td><td>PERMANENT</td><td>—</td><td>Sep 10, 2026 · 7:43:35 AM</td><td><Badge tone="green">Active</Badge></td><td><button className="icon-button" aria-label="Edit REALEZA, CARLO L."><PencilSimple /></button></td></tr></tbody></table></div><div className="pagination"><span>Showing 1 of 1 personnel</span><div><button disabled><ArrowLeft /></button><button className="active">1</button><button disabled><ArrowRight /></button></div></div></section>}

    {tab === "Devices & locations" && <div className="device-grid"><article className="device-card"><div className="device-card-head"><span><DeviceMobile weight="duotone" /></span><Badge tone="green"><i className="status-dot" /> Imported</Badge></div><h2>Location 101</h2><p>Location ID: 101</p><dl><div><dt>Latest event</dt><dd>Sep 10, 2026 · 7:43 AM</dd></div><div><dt>Events stored</dt><dd>2</dd></div><div><dt>Personnel</dt><dd>1</dd></div><div><dt>Source workbook</dt><dd>biometrics.xlsx</dd></div></dl><div className="device-card-actions"><button className="button secondary"><ArrowsClockwise /> Refresh import</button><button className="button secondary"><PencilSimple /> Add location details</button></div></article><button className="add-device-card"><Plus /><strong>Register a source</strong><span>Add another approved biometric source</span></button></div>}

    {tab === "Recent activity" && <section className="panel activity-full"><div className="activity-filters"><select aria-label="Biometrics activity type"><option>All actions</option><option>Workbook imports</option><option>Record changes</option><option>Reviews</option></select><select aria-label="Biometrics activity location"><option>All locations</option><option>Location 101</option></select><input type="date" aria-label="Activity start date" /><button className="button secondary"><Funnel /> Apply filters</button></div><ActivityList items={biometricsActivity} /></section>}

    {tab === "Data quality" && <section className="quality-page"><div className="quality-hero biometrics-quality"><CheckCircle weight="fill" /><div><h2>Biometrics data health: 90%</h2><p>All two attendance records include the required identity, date, status, location, and verification fields.</p></div><button className="button secondary">Run checks</button></div><div className="quality-cards"><div><WarningCircle /><strong>2</strong><span>Blank card numbers</span><button>Review source records</button></div><div><ArrowsClockwise /><strong>0</strong><span>Duplicate attendance events</span><button>View duplicate rules</button></div><div><DeviceMobile /><strong>1</strong><span>Source location represented</span><button>View source details</button></div></div><section className="panel quality-rules"><div className="panel-header"><div><h2>Automated quality rules</h2><p>Checks applied to the imported workbook</p></div></div><div><p><CheckCircle /> Department, employee number, and name are present <Badge tone="green">2 passed</Badge></p><p><CheckCircle /> Date and time values are valid <Badge tone="green">2 passed</Badge></p><p><CheckCircle /> Location and verification values are present <Badge tone="green">2 passed</Badge></p><p><WarningCircle /> Card number is populated <Badge tone="amber">2 blank</Badge></p></div></section></section>}
  </div>;
}

type ManagedAccount = { id: string; full_name: string; username: string; email: string; role: "staff"|"data_steward"; department_id: string | null; status: string };
type ManagedGrant = { user_id: string; dataset_id: string; access_mode: "read_only"|"read_write" };
type ManagedDataset = { id: string; slug: string };

function AccessManagement() {
  const emptyAccess: Record<DatabaseKey, AccessLevel> = { jobseekers: "none", research: "none", biometrics: "none" };
  const slugKeys: Record<string, DatabaseKey> = { jobseeker_registry: "jobseekers", research_requests: "research", biometric_events: "biometrics" };
  const datasetSlugs: Record<DatabaseKey, string> = { jobseekers: "jobseeker_registry", research: "research_requests", biometrics: "biometric_events" };
  const [accounts, setAccounts] = useState<ManagedAccount[]>([]); const [departments, setDepartments] = useState<ApprovalDepartment[]>([]); const [datasets, setDatasets] = useState<ManagedDataset[]>([]); const [grants, setGrants] = useState<ManagedGrant[]>([]);
  const [selectedId, setSelectedId] = useState(""); const [departmentId, setDepartmentId] = useState(""); const [accountRole, setAccountRole] = useState<"staff"|"data_steward">("staff"); const [levels, setLevels] = useState<Record<DatabaseKey, AccessLevel>>(emptyAccess);
  const [query, setQuery] = useState(""); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const selected = accounts.find((account)=>account.id===selectedId)??null;
  const levelsFor = (accountId: string, currentDatasets: ManagedDataset[], currentGrants: ManagedGrant[]) => { const next = { ...emptyAccess }; currentGrants.filter((grant)=>grant.user_id===accountId).forEach((grant)=>{ const dataset = currentDatasets.find((item)=>item.id===grant.dataset_id); const key = dataset ? slugKeys[dataset.slug] : undefined; if (key) next[key] = grant.access_mode === "read_write" ? "write" : "read"; }); return next; };
  const initials = (name: string) => name.split(" ").filter(Boolean).map((part)=>part[0]).slice(0,2).join("").toUpperCase();
  const roleName = (role: ManagedAccount["role"]) => role === "data_steward" ? "Data Steward" : "Staff";

  useEffect(()=>{ let active=true; const supabase=createSupabaseClient(); Promise.all([
    supabase.schema("core").from("profiles").select("id, full_name, username, email, role, department_id, status").eq("status","active").neq("role","dpo").order("full_name"),
    supabase.schema("core").from("departments").select("id, name").eq("is_active",true).order("name"),
    supabase.schema("core").from("datasets").select("id, slug").eq("is_active",true),
    supabase.schema("core").from("user_dataset_grants").select("user_id, dataset_id, access_mode").is("revoked_at",null),
  ]).then(([accountResult,departmentResult,datasetResult,grantResult])=>{ if(!active)return; const firstError=accountResult.error??departmentResult.error??datasetResult.error??grantResult.error; if(firstError){setError(firstError.message);}else{const nextAccounts=(accountResult.data??[]) as ManagedAccount[]; const nextDepartments=(departmentResult.data??[]) as ApprovalDepartment[]; const nextDatasets=(datasetResult.data??[]) as ManagedDataset[]; const nextGrants=(grantResult.data??[]) as ManagedGrant[]; const first=nextAccounts[0]; const firstLevels:Record<DatabaseKey,AccessLevel>={jobseekers:"none",research:"none",biometrics:"none"}; if(first){nextGrants.filter((grant)=>grant.user_id===first.id).forEach((grant)=>{const dataset=nextDatasets.find((item)=>item.id===grant.dataset_id);const key=dataset?({jobseeker_registry:"jobseekers",research_requests:"research",biometric_events:"biometrics"} as Record<string,DatabaseKey>)[dataset.slug]:undefined;if(key)firstLevels[key]=grant.access_mode==="read_write"?"write":"read";});} setAccounts(nextAccounts); setDepartments(nextDepartments); setDatasets(nextDatasets); setGrants(nextGrants); setSelectedId(first?.id??""); setDepartmentId(first?.department_id??""); setAccountRole(first?.role??"staff"); setLevels(firstLevels);} setLoading(false); }); return()=>{active=false;}; },[]);

  const choose = (account: ManagedAccount) => { setSelectedId(account.id); setDepartmentId(account.department_id??""); setAccountRole(account.role); setLevels(levelsFor(account.id,datasets,grants)); setNotice(""); setError(""); };
  const cancel = () => { if(selected) choose(selected); };
  const save = async () => { if(!selected||!departmentId){setError("Choose a department before saving access.");return;} setSaving(true);setError("");setNotice(""); const datasetGrants=(Object.keys(levels) as DatabaseKey[]).filter((key)=>levels[key]!=="none").map((key)=>({dataset_slug:datasetSlugs[key],access_mode:levels[key]==="write"?"read_write":"read_only",department_scope_id:null})); const {error:saveError}=await createSupabaseClient().schema("core").rpc("update_account_access",{target_user_id:selected.id,updated_department_id:departmentId,updated_role:accountRole,dataset_grants:datasetGrants}); if(saveError){setError(saveError.message);}else{const updatedAccounts=accounts.map((account)=>account.id===selected.id?{...account,department_id:departmentId,role:accountRole}:account); const replacementGrants=datasetGrants.map((grant)=>({user_id:selected.id,dataset_id:datasets.find((dataset)=>dataset.slug===grant.dataset_slug)?.id??"",access_mode:grant.access_mode as "read_only"|"read_write"})).filter((grant)=>grant.dataset_id); setAccounts(updatedAccounts); setGrants([...grants.filter((grant)=>grant.user_id!==selected.id),...replacementGrants]); setNotice(`Access settings saved for ${selected.full_name}.`);} setSaving(false); };
  const filtered=accounts.filter((account)=>`${account.full_name} ${account.username} ${account.email}`.toLowerCase().includes(query.toLowerCase()));

  return <div className="page"><PageHeader eyebrow="DPO controls" title="Users & access" description="Assign database access and permission levels for active accounts." actions={<Badge tone="green"><CheckCircle/> Live Supabase access</Badge>} />
    {notice&&<div className="toast" role="status"><CheckCircle weight="fill" /> {notice}</div>}{error&&<p className="form-error" role="alert">{error}</p>}
    {loading?<section className="panel empty-state"><SpinnerGap className="spin"/><h2>Loading active accounts</h2><p>Reading current roles and database grants.</p></section>:<div className="access-layout"><section className="panel user-list-panel"><div className="table-search"><MagnifyingGlass /><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search accounts" /></div><div className="user-list">{filtered.length===0?<div className="empty-state"><Users/><h2>No accounts found</h2><p>Try another name or username.</p></div>:filtered.map((account)=><button key={account.id} className={account.id===selectedId?"active":""} onClick={()=>choose(account)}><span className="avatar">{initials(account.full_name)}</span><div><strong>{account.full_name}</strong><span>{departments.find((department)=>department.id===account.department_id)?.name??"No department"}</span></div><Badge tone={account.role==="data_steward"?"purple":"neutral"}>{roleName(account.role)}</Badge></button>)}</div></section>
      {selected?<section className="panel access-editor"><div className="access-person"><div className="avatar large">{initials(selected.full_name)}</div><div><h2>{selected.full_name}</h2><p>{selected.email}</p><span>@{selected.username} · Active account</span></div><Badge tone="green">Active</Badge></div><div className="form-grid"><label>Department<select value={departmentId} onChange={(event)=>setDepartmentId(event.target.value)}><option value="">Select department</option>{departments.map((department)=><option key={department.id} value={department.id}>{department.name}</option>)}</select></label><label>Account role<select value={accountRole} onChange={(event)=>setAccountRole(event.target.value as "staff"|"data_steward")}><option value="staff">Staff</option><option value="data_steward">Data Steward</option></select></label></div><div className="permission-heading"><div><h3>Database permissions</h3><p>Choose the highest level this account can use for each database.</p></div><Badge tone="blue"><Lock /> DPO managed</Badge></div><div className="permission-table"><div className="permission-row heading"><span>Database</span><span>No access</span><span>Read only</span><span>Read/write</span></div>{(Object.keys(databaseMeta) as DatabaseKey[]).map((key,i)=><div className="permission-row" key={key}><div><span className="db-initial" style={{background:databaseMeta[key].color}}>{databaseMeta[key].short}</span><div><strong>{databaseMeta[key].name}</strong><small>{i===0?"Profiles and qualifications":i===1?"Requests and releases":"Device records and events"}</small></div></div>{(["none","read","write"] as AccessLevel[]).map((level)=><label key={level}><input type="radio" name={`access-${key}`} checked={levels[key]===level} onChange={()=>setLevels((current)=>({...current,[key]:level}))}/><span className="radio-visual"><Check /></span></label>)}</div>)}</div><div className="access-callout"><ShieldCheck /><div><strong>Permission changes take effect immediately</strong><p>Future database queries and imports will use the saved access levels.</p></div></div><div className="editor-actions"><button className="button secondary" onClick={cancel} disabled={saving}>Cancel changes</button><button className="button primary" onClick={save} disabled={saving}>{saving?<><SpinnerGap className="spin"/> Saving…</>:<><Check /> Save access</>}</button></div></section>:<section className="panel access-editor empty-state"><Users/><h2>No active account selected</h2><p>Approved Staff and Data Steward accounts will appear here.</p></section>}</div>}
  </div>;
}

type PendingAccount = { id: string; full_name: string; username: string; email: string; requested_department_id: string | null; created_at: string };
type ApprovalDepartment = { id: string; name: string };

function Approvals() {
  const [accounts, setAccounts] = useState<PendingAccount[]>([]); const [departments, setDepartments] = useState<ApprovalDepartment[]>([]);
  const [selectedId, setSelectedId] = useState(""); const [departmentId, setDepartmentId] = useState(""); const [accountRole, setAccountRole] = useState<"staff"|"data_steward">("staff");
  const [access, setAccess] = useState<Record<DatabaseKey, AccessLevel>>({ jobseekers: "none", research: "none", biometrics: "none" });
  const [note, setNote] = useState(""); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const selected = accounts.find((account) => account.id === selectedId) ?? null;
  const datasetSlugs: Record<DatabaseKey, string> = { jobseekers: "jobseeker_registry", research: "research_requests", biometrics: "biometric_events" };

  useEffect(() => { let active = true; const supabase = createSupabaseClient(); Promise.all([
    supabase.schema("core").from("profiles").select("id, full_name, username, email, requested_department_id, created_at").eq("status", "pending").order("created_at", { ascending: true }),
    supabase.schema("core").from("departments").select("id, name").eq("is_active", true).order("name"),
  ]).then(([accountResult, departmentResult]) => { if (!active) return; if (accountResult.error || departmentResult.error) { setError(accountResult.error?.message ?? departmentResult.error?.message ?? "Approval data could not be loaded."); } else { const nextAccounts = (accountResult.data ?? []) as PendingAccount[]; setAccounts(nextAccounts); setDepartments((departmentResult.data ?? []) as ApprovalDepartment[]); setSelectedId(nextAccounts[0]?.id ?? ""); setDepartmentId(nextAccounts[0]?.requested_department_id ?? ""); } setLoading(false); }); return () => { active = false; }; }, []);

  const chooseAccount = (account: PendingAccount) => { setSelectedId(account.id); setDepartmentId(account.requested_department_id ?? ""); setAccountRole("staff"); setAccess({ jobseekers: "none", research: "none", biometrics: "none" }); setNote(""); setError(""); };
  const removeDecidedAccount = (message: string) => { const remaining = accounts.filter((account) => account.id !== selectedId); setAccounts(remaining); setSelectedId(remaining[0]?.id ?? ""); setDepartmentId(remaining[0]?.requested_department_id ?? ""); setAccountRole("staff"); setAccess({ jobseekers: "none", research: "none", biometrics: "none" }); setNote(""); setNotice(message); };
  const approve = async () => {
    if (!selected || !departmentId) { setError("Choose the approved department before activating the account."); return; }
    setSaving(true); setError(""); setNotice("");
    const grants = (Object.keys(access) as DatabaseKey[]).filter((key) => access[key] !== "none").map((key) => ({ dataset_slug: datasetSlugs[key], access_mode: access[key] === "write" ? "read_write" : "read_only", department_scope_id: null }));
    const { error: approvalError } = await createSupabaseClient().schema("core").rpc("approve_account", { applicant_id: selected.id, approved_department_id: departmentId, approved_role: accountRole, dataset_grants: grants, decision_reason: note || null });
    if (approvalError) setError(approvalError.message); else removeDecidedAccount(`${selected.full_name} was approved and activated.`);
    setSaving(false);
  };
  const reject = async () => {
    if (!selected) return; setSaving(true); setError(""); setNotice("");
    const { error: rejectionError } = await createSupabaseClient().schema("core").rpc("reject_account", { applicant_id: selected.id, decision_reason: note || null });
    if (rejectionError) setError(rejectionError.message); else removeDecidedAccount(`${selected.full_name}'s request was rejected.`);
    setSaving(false);
  };
  const initials = (name: string) => name.split(" ").filter(Boolean).map((part) => part[0]).slice(0,2).join("").toUpperCase();
  const requestedDepartment = selected ? departments.find((department) => department.id === selected.requested_department_id)?.name ?? "Not specified" : "";

  return <div className="page"><PageHeader eyebrow="DPO controls" title="Account approvals" description="Verify applicants and assign database permissions before activation." />
    {notice && <div className="decision-banner approved"><CheckCircle weight="fill" /><span><strong>Decision saved.</strong> {notice}</span><button onClick={()=>setNotice("")} aria-label="Dismiss message"><X /></button></div>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {loading ? <section className="panel empty-state"><SpinnerGap className="spin" /><h2>Loading account requests</h2><p>Checking the live approval queue.</p></section> : <div className="approval-layout"><section className="panel approval-queue"><div className="queue-head"><h2>Pending requests</h2><Badge tone={accounts.length ? "amber" : "green"}>{accounts.length} waiting</Badge></div>{accounts.length===0?<div className="empty-state"><CheckCircle weight="fill"/><h2>Queue is clear</h2><p>New account requests will appear here after sign-up.</p></div>:accounts.map((account)=><button className={account.id===selectedId?"active":""} key={account.id} onClick={()=>chooseAccount(account)}><span className="avatar">{initials(account.full_name)}</span><div><strong>{account.full_name}</strong><span>{departments.find((department)=>department.id===account.requested_department_id)?.name??"Department not specified"}</span><small>Submitted {new Date(account.created_at).toLocaleDateString("en-PH",{dateStyle:"medium"})}</small></div><ArrowRight /></button>)}</section>
      {selected?<section className="panel approval-review"><div className="review-title"><div><span className="avatar xlarge">{initials(selected.full_name)}</span><div><h2>{selected.full_name}</h2><p>{selected.email}</p></div></div><Badge tone="amber"><Clock /> Pending</Badge></div><div className="identity-grid"><div><span>Username</span><strong>{selected.username}</strong></div><div><span>Requested department</span><strong>{requestedDepartment}</strong></div><div><span>Submitted</span><strong>{new Date(selected.created_at).toLocaleString("en-PH",{dateStyle:"medium",timeStyle:"short"})}</strong></div><div><span>Request ID</span><strong>{selected.id.slice(0,8).toUpperCase()}</strong></div></div><div className="verification-note"><WarningCircle /><span><strong>Verify department affiliation</strong> before approving. The email address is retained as account contact information.</span></div><div className="form-grid"><label>Approved department<select value={departmentId} onChange={(event)=>setDepartmentId(event.target.value)}><option value="">Select department</option>{departments.map((department)=><option key={department.id} value={department.id}>{department.name}</option>)}</select></label><label>Account role<select value={accountRole} onChange={(event)=>setAccountRole(event.target.value as "staff"|"data_steward")}><option value="staff">Staff</option><option value="data_steward">Data Steward</option></select></label></div><div className="permission-heading"><div><h3>Database access</h3><p>Choose a permission for every database.</p></div></div><div className="approval-access">{(Object.keys(databaseMeta) as DatabaseKey[]).map((key)=><div key={key}><div><span className="db-initial" style={{background:databaseMeta[key].color}}>{databaseMeta[key].short}</span><strong>{databaseMeta[key].name}</strong></div><select value={access[key]} onChange={(event)=>setAccess((current)=>({...current,[key]:event.target.value as AccessLevel}))}><option value="none">No access</option><option value="read">Read only</option><option value="write">Read/write</option></select></div>)}</div><label>Decision note<textarea value={note} onChange={(event)=>setNote(event.target.value)} placeholder="Add a reason or verification note (optional)" /></label><div className="editor-actions split"><button className="button danger" onClick={reject} disabled={saving}><XCircle /> Reject request</button><button className="button primary" onClick={approve} disabled={saving}>{saving?<><SpinnerGap className="spin"/> Saving…</>:<><CheckCircle /> Approve & activate</>}</button></div></section>:<section className="panel approval-review empty-state"><UserPlus/><h2>No request selected</h2><p>The approval form will appear when an account is waiting.</p></section>}</div>}
  </div>;
}

function SystemActivity() {
  return <div className="page"><PageHeader eyebrow="Administration" title="System activity" description="A complete view of data changes, access decisions, and authentication events." actions={<button className="button secondary"><DownloadSimple /> Export activity</button>} /><section className="panel activity-full"><div className="activity-summary"><div><span>Events today</span><strong>148</strong></div><div><span>Data changes</span><strong>63</strong></div><div><span>Successful logins</span><strong>81</strong></div><div><span>Failed logins</span><strong className="danger-text">4</strong></div><div className="ingestion"><i /><span>Activity collection healthy<br/><small>Updated just now</small></span></div></div><div className="activity-filters"><div className="table-search"><MagnifyingGlass /><input placeholder="Search activity" /></div><select><option>All databases</option><option>Jobseeker Registry</option><option>Research Requests</option><option>Biometrics Data</option></select><select><option>All outcomes</option><option>Successful</option><option>Failed</option></select><input type="date" aria-label="Start date" /><button className="button secondary"><Funnel /> Filters</button></div><div className="activity-timeline"><div className="timeline-date">Today</div><ActivityList /><div className="timeline-date">Yesterday</div><ActivityList items={activityItems.slice(0,3)} /></div></section></div>;
}

function ImportFlow({ initialModule }: { initialModule: DatabaseKey }) {
  const [step, setStep] = useState(1);
  const [module, setModule] = useState<DatabaseKey>(initialModule);
  const [file, setFile] = useState<File | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ jobId: string; total: number; accepted: number; rejected: number; errors: Array<{ source_row_number: number; message: string }> } | null>(null);
  const mappings: Record<DatabaseKey, Array<[string, string]>> = {
    jobseekers: [["SURNAME", "Surname"], ["FIRST NAME", "First name"], ["DATE OF BIRTH", "Birth date"], ["CONTACT NUMBER/S", "Mobile number"], ["EMAIL ADDRESS", "Email"]],
    research: [["CATEGORY", "Category"], ["RESEARCHER / REQUESTER NAME", "Requester name"], ["SCHOOL / INSTITUTION / OFFICE", "Institution / office"], ["RESEARCH TITLE / PURPOSE", "Title / purpose"], ["CONTROL NO.", "Control number"]],
    biometrics: [["DEPARTMENT", "Department"], ["NAME", "Person name"], ["NO.", "Personnel number"], ["DATE/TIME", "Event date and time"], ["VERIFYCODE", "Verification method"]],
  };
  const destinationName = databaseMeta[module].name;
  const chooseFile = (nextFile: File | null) => {
    setError(""); setResult(null); setConfirmed(false);
    if (!nextFile) return;
    const extension = nextFile.name.split(".").pop()?.toLowerCase();
    const supported = module === "biometrics" ? ["xlsx", "xls", "csv"] : ["xlsx", "csv"];
    if (!extension || !supported.includes(extension)) { setError(module === "biometrics" ? "Choose an XLS, XLSX, or CSV file." : "Choose an XLSX or CSV file."); return; }
    if (nextFile.size > 25 * 1024 * 1024) { setError("The selected file exceeds the 25 MB limit."); return; }
    setFile(nextFile); setStep(2);
  };
  const startImport = async () => {
    if (!file || !confirmed) return;
    setImporting(true); setError("");
    try {
      const { data } = await createSupabaseClient().auth.getSession();
      if (!data.session) throw new Error("Your session expired. Sign in again before importing.");
      const body = new FormData(); body.set("module", module); body.set("file", file);
      const response = await fetch("/api/imports", { method: "POST", headers: { Authorization: `Bearer ${data.session.access_token}` }, body });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "The import could not be completed.");
      setResult(payload); setStep(4);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "The import could not be completed.");
    } finally { setImporting(false); }
  };
  const reset = () => { setStep(1); setFile(null); setConfirmed(false); setResult(null); setError(""); };
  return <div className="page narrow-page"><PageHeader eyebrow="Data operations" title="Import records" description="Upload, validate, and commit source records to Supabase with a complete import log." /><div className="stepper">{["Upload","Map fields","Validate","Review & import"].map((x,i)=><div className={step>i+1?"done":step===i+1?"active":""} key={x}><span>{step>i+1?<Check />:i+1}</span><strong>{x}</strong></div>)}</div><section className="panel import-card">
    {error && <p className="form-error" role="alert">{error}</p>}
    {step===1&&<><h2>Choose destination and file</h2><p>Select the destination database. The importer will apply its required fields and use the first worksheet in the file.</p><label>Destination database<select value={module} onChange={(event)=>setModule(event.target.value as DatabaseKey)}><option value="jobseekers">Jobseeker Registry</option><option value="research">Research & Data Requests</option><option value="biometrics">Biometrics Data</option></select></label><label className="dropzone"><FileArrowUp weight="duotone"/><strong>Choose an Excel or CSV file</strong><span>Maximum file size: 25 MB</span><em>{module === "biometrics" ? ".XLS, .XLSX, .CSV" : ".XLSX, .CSV"}</em><input className="visually-hidden" type="file" accept={module === "biometrics" ? ".xls,.xlsx,.csv" : ".xlsx,.csv"} onChange={(event)=>chooseFile(event.target.files?.[0] ?? null)}/></label></>}
    {step===2&&file&&<><div className="import-file"><FileArrowUp/><div><strong>{file.name}</strong><span>{(file.size/1024).toLocaleString(undefined,{maximumFractionDigits:1})} KB · Ready for secure processing</span></div><Badge tone="green"><Check/> Selected</Badge></div><h2>Automatic field mapping</h2><p>The importer recognizes the source columns below. Extra columns are retained as source metadata where supported.</p><div className="mapping-list">{mappings[module].map(([source,destination])=><div key={source}><span>{source}</span><ArrowRight/><strong>{destination}</strong><Badge tone="green">Matched</Badge></div>)}</div></>}
    {step===3&&file&&<><div className="validation-progress"><CheckCircle weight="fill"/><h2>Validation is ready</h2><p>Each row will be checked for required names, identifiers, and valid dates before it is written.</p></div><div className="issue-list"><div><ShieldCheck/><span><strong>Database permissions will be enforced</strong><small>You need read/write access to {destinationName}. Rejected rows will be recorded without stopping valid rows.</small></span></div></div></>}
    {step===4&&file&&!result&&<><div className="validation-progress"><ShieldCheck weight="fill"/><h2>Ready to import</h2><p>The source file will be processed on the server and the result will be recorded in system activity.</p></div><div className="import-summary"><div><span>Destination</span><strong>{destinationName}</strong></div><div><span>Import file</span><strong>{file.name}</strong></div><div><span>Maximum size</span><strong>25 MB</strong></div><div><span>Invalid rows</span><strong>Skipped and logged</strong></div></div><label className="consent"><input type="checkbox" checked={confirmed} onChange={(event)=>setConfirmed(event.target.checked)}/><span>I reviewed the destination and confirm this import.</span></label></>}
    {step===4&&result&&<><div className="validation-progress"><CheckCircle weight="fill"/><h2>Import completed</h2><p>{result.accepted.toLocaleString()} records were added to {destinationName}.</p></div><div className="validation-stats"><div><strong>{result.total.toLocaleString()}</strong><span>Source rows</span></div><div><strong>{result.accepted.toLocaleString()}</strong><span>Imported</span></div><div><strong>{result.rejected.toLocaleString()}</strong><span>Rejected</span></div></div>{result.errors.length>0&&<div className="issue-list">{result.errors.slice(0,5).map((item)=><div key={`${item.source_row_number}-${item.message}`}><WarningCircle/><span><strong>Row {item.source_row_number}</strong><small>{item.message}</small></span></div>)}</div>}<div className="import-summary"><div><span>Import job</span><strong>{result.jobId}</strong></div></div></>}
    <div className="import-actions">{result?<button className="button primary" onClick={reset}><FileArrowUp/> Import another file</button>:<><button className="button secondary" onClick={()=>setStep(Math.max(1,step-1))} disabled={step===1||importing}><ArrowLeft/> Back</button>{step<4?<button className="button primary" onClick={()=>setStep(Math.min(4,step+1))} disabled={!file}>Continue <ArrowRight/></button>:<button className="button primary" onClick={startImport} disabled={!confirmed||importing}>{importing?<><SpinnerGap className="spin"/> Importing…</>:<>Start import <FileArrowUp/></>}</button>}</>}</div>
  </section></div>;
}

type LiveRecord = { id: string; [key: string]: unknown };

const liveModuleConfig: Record<DatabaseKey, { title: string; description: string; schema: string; table: string; columns: Array<[string, string]> }> = {
  jobseekers: { title: "Jobseeker Registry", description: "Live records available to your account.", schema: "jobseekers", table: "people", columns: [["name", "Name"], ["employment_status", "Employment status"], ["preferred_occupation", "Preferred occupation"]] },
  research: { title: "Research & Data Requests", description: "Live requests available to your account.", schema: "research", table: "requests", columns: [["control_number", "Control no."], ["requester_name", "Requester"], ["institution_office", "Institution / office"], ["research_title_purpose", "Research title / purpose"], ["status", "Status"], ["date_received", "Received"]] },
  biometrics: { title: "Biometrics Data", description: "Live attendance metadata available to your account.", schema: "biometrics", table: "device_events", columns: [["person_name", "Name"], ["personnel_number", "No."], ["occurred_at", "Date / time"], ["attendance_status", "Status"], ["external_location_id", "Location ID"], ["verify_code", "Verify code"]] },
};

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string" && (value.endsWith("Z") || /^\d{4}-\d{2}-\d{2}/.test(value))) {
    const date = new Date(value); if (!Number.isNaN(date.valueOf())) return date.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: value.includes("T") ? "short" : undefined });
  }
  return String(value).replaceAll("_", " ");
}

function prepareLiveRecords(database: DatabaseKey, rows: LiveRecord[]) {
  if (database !== "jobseekers") return rows;
  return rows.map((record) => {
    const metadata = record.metadata && typeof record.metadata === "object" ? record.metadata as Record<string, unknown> : {};
    const name = [record.first_name, record.middle_name, record.surname]
      .map((part) => String(part ?? "").trim())
      .filter(Boolean)
      .join(" ");
    return {
      ...record,
      name,
      employment_status: metadata["EMPLOYMENT STATUS"],
      preferred_occupation: metadata["PREFERRED CCUPATION/S"] ?? metadata["PREFERRED OCCUPATION/S"],
    };
  });
}

function LiveModuleDashboard({ database, onImport }: { database: DatabaseKey; onImport: () => void }) {
  const config = liveModuleConfig[database]; const [records, setRecords] = useState<LiveRecord[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [query, setQuery] = useState("");
  useEffect(() => { let active = true; createSupabaseClient().schema(config.schema).from(config.table).select("*").order("created_at", { ascending: false }).limit(100).then(({ data, error: loadError }: { data: unknown; error: { message: string } | null }) => { if (!active) return; if (loadError) setError(loadError.message); else setRecords(prepareLiveRecords(database, (data ?? []) as LiveRecord[])); setLoading(false); }); return () => { active = false; }; }, [config.schema, config.table, database]);
  const filtered = records.filter((record) => Object.values(record).join(" ").toLowerCase().includes(query.toLowerCase()));
  return <div className="page"><div className="breadcrumb"><button>My databases</button><span>/</span><span>{config.title}</span></div><PageHeader title={config.title} description={config.description} actions={<><Badge tone="green"><CheckCircle /> Live Supabase data</Badge><button className="button primary" onClick={onImport}><FileArrowUp /> Import data</button></>} /><div className="compact-metrics"><div><span>Visible records</span><strong>{loading ? "…" : records.length}</strong><small>Up to 100 newest records</small></div><div><span>Access</span><strong>RLS</strong><small>Filtered by your dataset grant</small></div><div><span>Source</span><strong>Supabase</strong><small>{config.schema}.{config.table}</small></div><div><span>Refresh</span><strong>Live</strong><small>Reload the page for the latest data</small></div></div><section className="panel table-panel"><div className="table-toolbar"><div className="table-search"><MagnifyingGlass /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search visible records" aria-label={`Search ${config.title}`} /></div></div>{loading ? <div className="empty-state"><SpinnerGap className="spin" /><h2>Loading records</h2><p>Checking your dataset access and loading current records.</p></div> : error ? <div className="empty-state"><WarningCircle /><h2>Records are unavailable</h2><p>{error}</p></div> : filtered.length === 0 ? <div className="empty-state"><Archive /><h2>No records yet</h2><p>This dataset has no records visible to your account. Import a source file after a DPO grants read/write access.</p></div> : <><div className="table-scroll"><table><thead><tr>{config.columns.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead><tbody>{filtered.map((record) => <tr key={record.id}>{config.columns.map(([key]) => <td key={key}>{displayValue(record[key])}</td>)}</tr>)}</tbody></table></div><div className="pagination"><span>Showing {filtered.length} of {records.length} records</span></div></>}</section></div>;
}

function LiveAdminDashboard({ profile, openDatabase }: { profile: AuthProfile; openDatabase: (database: DatabaseKey) => void }) {
  const [counts, setCounts] = useState<Record<DatabaseKey, number>>({ jobseekers: 0, research: 0, biometrics: 0 }); const [error, setError] = useState("");
  useEffect(() => { let active = true; Promise.all([createSupabaseClient().schema("jobseekers").from("people").select("id", { count: "exact", head: true }), createSupabaseClient().schema("research").from("requests").select("id", { count: "exact", head: true }), createSupabaseClient().schema("biometrics").from("device_events").select("id", { count: "exact", head: true })]).then((results) => { if (!active) return; if (results.some((result) => result.error)) setError("Some dataset totals are unavailable for this account."); setCounts({ jobseekers: results[0].count ?? 0, research: results[1].count ?? 0, biometrics: results[2].count ?? 0 }); }); return () => { active = false; }; }, []);
  return <div className="page"><PageHeader eyebrow="Live data" title={`Welcome, ${profile.full_name}`} description="Counts below are read directly from Supabase and limited by your permissions." /><section className="alert-strip"><div><ShieldCheck weight="fill" /><span><strong>Connected to Supabase.</strong> Your role and module access are read from your approved profile.</span></div></section>{error && <p className="form-error" role="alert">{error}</p>}<div className="metric-grid">{(Object.keys(databaseMeta) as DatabaseKey[]).map((database, index) => { const db = databaseMeta[database]; const Icon = [IdentificationCard, Archive, Fingerprint][index]; return <button key={database} className="metric-card" onClick={() => openDatabase(database)}><div className="metric-top"><span className="metric-icon" style={{ background: `${db.color}14`, color: db.color }}><Icon /></span><Badge tone="green">Live</Badge></div><span>{db.name}</span><strong>{counts[database]}</strong><small>Visible records in Supabase</small><div className="metric-link">Open database <ArrowRight /></div></button>; })}</div></div>;
}

export function EnterpriseDataApp() {
  const [screen, setScreen] = useState<Screen>("login"); const [role, setRole] = useState<Role>("Staff"); const [profile, setProfile] = useState<AuthProfile | null>(null); const [booting, setBooting] = useState(true);
  const [selectedDatabase, setSelectedDatabase] = useState<DatabaseKey>("jobseekers");
  const openDatabase = (key: DatabaseKey) => { setSelectedDatabase(key); setScreen("database"); };
  const importDatabase = (key: DatabaseKey) => { setSelectedDatabase(key); setScreen("import"); };
  const activateProfile = (nextProfile: AuthProfile) => { setProfile(nextProfile); setRole(roleLabel(nextProfile.role)); setScreen(nextProfile.status === "active" ? "admin" : "pending"); };
  useEffect(() => { let active = true; createSupabaseClient().auth.getSession().then(async ({ data }: { data: { session: { user: { id: string } } | null } }) => { if (!data.session) return; const { data: nextProfile } = await createSupabaseClient().schema("core").from("profiles").select("id, full_name, username, email, role, status").eq("id", data.session.user.id).maybeSingle(); if (active && nextProfile) activateProfile(nextProfile as AuthProfile); }).catch(() => undefined).finally(() => { if (active) setBooting(false); }); return () => { active = false; }; }, []);
  const signOut = async () => { await createSupabaseClient().auth.signOut(); setProfile(null); setRole("Staff"); setScreen("login"); };
  if (booting) return <AuthShell><div className="status-card"><SpinnerGap className="spin" /><h2>Checking your secure session</h2><p>Loading your approved account and permissions.</p></div></AuthShell>;
  if (screen === "login") return <Login navigate={setScreen} onAuthenticated={activateProfile} />;
  if (screen === "register") return <Register navigate={setScreen} />;
  if (screen === "pending") return <Pending navigate={setScreen} />;
  let content: React.ReactNode;
  switch(screen) {
    case "admin": content=profile ? <LiveAdminDashboard profile={profile} openDatabase={openDatabase}/> : <LiveAdminDashboard profile={{ id: "", full_name: "Municipal user", username: "", email: "", role: "staff", status: "active" }} openDatabase={openDatabase}/>; break;
    case "databases": content=<Databases openDatabase={openDatabase} importDatabase={importDatabase}/>; break;
    case "database": content=<LiveModuleDashboard key={selectedDatabase} database={selectedDatabase} onImport={()=>setScreen("import")}/>; break;
    case "access": content=<AccessManagement/>; break;
    case "approvals": content=<Approvals/>; break;
    case "activity": content=<SystemActivity/>; break;
    case "import": content=<ImportFlow key={selectedDatabase} initialModule={selectedDatabase}/>; break;
    default: content=profile ? <LiveAdminDashboard profile={profile} openDatabase={openDatabase}/> : null;
  }
  return <AppShell screen={screen} setScreen={setScreen} role={role} selectedDatabase={selectedDatabase} openDatabase={openDatabase} onSignOut={signOut}>{content}</AppShell>;
}
