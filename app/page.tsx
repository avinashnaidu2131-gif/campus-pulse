"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import type { FormEvent, ReactNode } from "react";

const API_BASE = "https://1zsyi1450e.execute-api.ap-southeast-2.amazonaws.com";

/* ----------------------------- Types ----------------------------- */

type Priority = "CRITICAL" | "HIGH" | "NORMAL";

type Ticket = {
  ticket_id: string;
  room: string;
  category: string;
  description: string;
  priority: Priority;
  status: string;
  created_at: string;
};

type OptOut = {
  date_meal: string;
  student_id: string;
  timestamp: string;
};

type Notice = { kind: "ok" | "err"; text: string } | null;

/* --------------------------- Constants --------------------------- */

const KG_PER_PLATE = 0.45;
const INR_PER_PLATE = 65;
const PERSONAL_GOAL_MEALS = 20;

const MEALS = [
  { id: "BREAKFAST", label: "Breakfast", emoji: "🍳", time: "7:30 – 9:00" },
  { id: "LUNCH", label: "Lunch", emoji: "🍛", time: "12:30 – 2:00" },
  { id: "DINNER", label: "Dinner", emoji: "🌙", time: "7:30 – 9:00" },
] as const;

const PRESETS = [
  {
    label: "⚡ Electrical Spark (Critical)",
    category: "Electrical",
    description: "Sparks coming from the switchboard next to my bed and there is a burning smell.",
    tone: "border-red-500/40 text-red-300 hover:bg-red-500/10",
  },
  {
    label: "💧 Water Pipe Leak (High)",
    category: "Plumbing",
    description: "Water pipe under the washbasin is leaking and the bathroom floor is wet.",
    tone: "border-amber-500/40 text-amber-300 hover:bg-amber-500/10",
  },
  {
    label: "🪑 Chair Repair (Normal)",
    category: "Furniture",
    description: "Study chair has a loose armrest. Needs tightening when convenient.",
    tone: "border-slate-600 text-slate-300 hover:bg-slate-700/40",
  },
] as const;

const CATEGORIES = ["Electrical", "Water", "Wi-Fi", "Plumbing", "Furniture"];

const CRITICAL_KW = [
  "spark",
  "short circuit",
  "short-circuit",
  "no water",
  "fire",
  "smoke",
  "burning",
  "shock",
  "electrocut",
  "gas leak",
  "exposed wire",
  "explosion",
];
const HIGH_KW = [
  "leak",
  "burst",
  "flood",
  "overflow",
  "no power",
  "power cut",
  "outage",
  "not working",
  "stopped working",
  "no internet",
  "no wifi",
  "broken",
  "clog",
  "blocked",
];

const PRIORITY_RANK: Record<Priority, number> = { CRITICAL: 0, HIGH: 1, NORMAL: 2 };

const PRIORITY_STYLE: Record<Priority, string> = {
  CRITICAL: "bg-red-500/15 text-red-300 border-red-500/40",
  HIGH: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  NORMAL: "bg-slate-700/50 text-slate-300 border-slate-600",
};

/* ---------------------------- Helpers ---------------------------- */

function previewPriority(text: string): Priority {
  const t = text.toLowerCase();
  if (CRITICAL_KW.some((k) => t.includes(k))) return "CRITICAL";
  if (HIGH_KW.some((k) => t.includes(k))) return "HIGH";
  return "NORMAL";
}

function matchedKeywords(text: string): string[] {
  const t = text.toLowerCase();
  return [...CRITICAL_KW, ...HIGH_KW].filter((k) => t.includes(k));
}

function formatIST(raw: string): string {
  if (!raw) return "—";
  let d: Date;
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const n = Number(raw);
    d = new Date(n < 1e12 ? n * 1000 : n);
  } else {
    const hasTz = /([zZ]|[+-]\d{2}:?\d{2})$/.test(raw);
    d = new Date(hasTz ? raw : raw.replace(" ", "T") + "Z");
  }
  if (isNaN(d.getTime())) return raw;
  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")} ${get("month")}, ${get("hour")}:${get("minute")} ${get("dayPeriod").toUpperCase()}`;
}

function isOpen(status: string): boolean {
  return !/resolved|closed|done|complete/i.test(status || "");
}

/* --------------------------- UI pieces --------------------------- */

function Icon({ children, className = "h-5 w-5" }: { children: ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-2xl border border-slate-800/80 bg-slate-900/60 backdrop-blur-xl shadow-xl shadow-black/20 ${className}`}
    >
      {children}
    </section>
  );
}

function StatCard({
  label,
  value,
  hint,
  tone,
  icon,
  pulse,
}: {
  label: string;
  value: string;
  hint: string;
  tone: string;
  icon: ReactNode;
  pulse?: boolean;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4 backdrop-blur-xl">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-slate-400">{label}</p>
        <span className={`relative flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800/80 ${tone}`}>
          {pulse && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-lg bg-red-500/20" />
          )}
          <span className="relative">{icon}</span>
        </span>
      </div>
      <p className={`mt-2 text-2xl font-bold tabular-nums sm:text-3xl ${tone}`}>{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${PRIORITY_STYLE[priority]}`}>
      {priority}
    </span>
  );
}

function BarRow({
  label,
  value,
  max,
  barClass,
  suffix,
}: {
  label: string;
  value: number;
  max: number;
  barClass: string;
  suffix?: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-sm">
        <span className="text-slate-300">{label}</span>
        <span className="font-semibold tabular-nums text-white">
          {value}
          {suffix ? <span className="ml-1 text-xs font-normal text-slate-500">{suffix}</span> : null}
        </span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${barClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ----------------------------- Page ------------------------------ */

export default function CampusPulse() {
  const [tab, setTab] = useState<"student" | "warden">("student");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [optouts, setOptouts] = useState<OptOut[]>([]);
  const [notice, setNotice] = useState<Notice>(null);
  const [loading, setLoading] = useState(false);
  const [online, setOnline] = useState(true);

  // Student: meal opt-out
  const [studentId, setStudentId] = useState("STU_204");
  const [mealDate, setMealDate] = useState("2026-11-28");
  const [mealType, setMealType] = useState<string>("LUNCH");

  // Student: ticket
  const [room, setRoom] = useState("B-204");
  const [category, setCategory] = useState("Electrical");
  const [description, setDescription] = useState("");

  // Warden: forecaster
  const [totalHostelers] = useState(500);
  const [menuType, setMenuType] = useState<"regular" | "special">("regular");
  const [dayMode, setDayMode] = useState<"weekday" | "weekend" | "exam">("weekday");

  // Warden: queue controls
  const [filter, setFilter] = useState<"ALL" | Priority>("ALL");
  const [query, setQuery] = useState("");

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/dashboard`);
      if (!res.ok) throw new Error("bad status");
      const data = await res.json();
      setTickets(data.tickets || []);
      setOptouts(data.optouts || []);
      setOnline(true);
    } catch {
      setOnline(false);
      setNotice({ kind: "err", text: "Could not load dashboard data. Check your connection and press Refresh." });
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
    const id = setInterval(fetchDashboard, 15000);
    return () => clearInterval(id);
  }, [fetchDashboard]);

  useEffect(() => {
    if (!notice || notice.kind === "err") return;
    const id = setTimeout(() => setNotice(null), 7000);
    return () => clearTimeout(id);
  }, [notice]);

  const handleOptOut = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setNotice(null);
    try {
      const res = await fetch(`${API_BASE}/optout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ student_id: studentId, date: mealDate, meal: mealType }),
      });
      if (res.ok) {
        setNotice({
          kind: "ok",
          text: `Opt-out recorded for ${mealType} on ${mealDate}. You saved ~${KG_PER_PLATE} kg of food!`,
        });
        fetchDashboard();
      } else {
        setNotice({ kind: "err", text: "Opt-out failed. Please try again." });
      }
    } catch {
      setNotice({ kind: "err", text: "Network error while saving your opt-out." });
    } finally {
      setLoading(false);
    }
  };

  const handleTicket = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setNotice(null);
    try {
      const res = await fetch(`${API_BASE}/ticket`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room, category, description }),
      });
      const data = await res.json();
      if (res.ok) {
        setNotice({
          kind: "ok",
          text:
            `Ticket #${data.ticket_id} logged as ${data.priority}` +
            (data.priority === "CRITICAL" ? " — Instant SNS alert sent to Warden!" : ""),
        });
        setDescription("");
        fetchDashboard();
      } else {
        setNotice({ kind: "err", text: "Could not submit the ticket. Please try again." });
      }
    } catch {
      setNotice({ kind: "err", text: "Network error while submitting the ticket." });
    } finally {
      setLoading(false);
    }
  };

  /* ---------------------- Derived: live impact ---------------------- */

  const mealsSaved = optouts.length;
  const kgPrevented = (mealsSaved * KG_PER_PLATE).toFixed(1);
  const inrMessSavings = (mealsSaved * INR_PER_PLATE).toLocaleString("en-IN");
  const openCritical = tickets.filter((t) => t.priority === "CRITICAL" && isOpen(t.status)).length;

  const myMeals = optouts.filter((o) => o.student_id === studentId).length;
  const myKg = (myMeals * KG_PER_PLATE).toFixed(1);
  const myPct = Math.min(100, (myMeals / PERSONAL_GOAL_MEALS) * 100);

  /* ------------------- Derived: demand forecaster ------------------- */

  const activeOptOuts = optouts.length;
  const baseRate = Math.min(
    1,
    Math.max(
      0,
      (menuType === "special" ? 0.94 : 0.84) -
        (dayMode === "weekend" ? 0.12 : 0) +
        (dayMode === "exam" ? 0.04 : 0)
    )
  );
  const predictedPlates = Math.max(0, Math.round((totalHostelers - activeOptOuts) * baseRate));
  const platesSaved = Math.max(0, totalHostelers - predictedPlates);
  const kgFoodSaved = (platesSaved * KG_PER_PLATE).toFixed(1);
  const inrSaved = (platesSaved * INR_PER_PLATE).toLocaleString("en-IN");
  const prepTarget = Math.ceil(predictedPlates * 1.05);

  /* ------------------------ Derived: queue ------------------------ */

  const counts = useMemo(
    () => ({
      ALL: tickets.length,
      CRITICAL: tickets.filter((t) => t.priority === "CRITICAL").length,
      HIGH: tickets.filter((t) => t.priority === "HIGH").length,
      NORMAL: tickets.filter((t) => t.priority === "NORMAL").length,
    }),
    [tickets]
  );

  const visibleTickets = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tickets
      .filter((t) => filter === "ALL" || t.priority === filter)
      .filter(
        (t) =>
          !q ||
          `${t.room} ${t.category} ${t.description} ${t.ticket_id}`.toLowerCase().includes(q)
      )
      .sort((a, b) => {
        const r = (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3);
        if (r !== 0) return r;
        return (b.created_at || "").localeCompare(a.created_at || "");
      });
  }, [tickets, filter, query]);

  /* ----------------- Derived: live priority preview ----------------- */

  const previewLevel = previewPriority(description);
  const previewHits = matchedKeywords(description).slice(0, 3);

  const inputCls =
    "w-full rounded-xl border border-slate-700/80 bg-slate-800/70 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20";

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-slate-950 font-sans text-slate-100">
      {/* Ambient glow */}
      <div
        className="pointer-events-none fixed inset-0 -z-0"
        style={{
          background:
            "radial-gradient(60rem 35rem at 12% -8%, rgba(16,185,129,0.16), transparent 60%), radial-gradient(50rem 32rem at 95% 0%, rgba(6,182,212,0.14), transparent 60%), radial-gradient(40rem 30rem at 50% 110%, rgba(16,185,129,0.08), transparent 60%)",
        }}
      />

      {/* Top navigation */}
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 text-slate-950">
              <Icon className="h-5 w-5">
                <path d="M3 12h4l2-6 4 12 2-6h6" />
              </Icon>
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight text-white">CampusPulse</h1>
              <p className="text-xs text-slate-400">Hostel mess and maintenance triage</p>
            </div>
          </div>

          <nav className="flex gap-1 rounded-xl border border-slate-800 bg-slate-900/70 p-1" aria-label="Views">
            {(
              [
                ["student", "Student Portal"],
                ["warden", "Warden Dashboard"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => {
                  setTab(id);
                  if (id === "warden") fetchDashboard();
                }}
                aria-pressed={tab === id}
                className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${
                  tab === id
                    ? "bg-emerald-500 text-slate-950 shadow shadow-emerald-500/30"
                    : "text-slate-300 hover:bg-slate-800"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>

          <div
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${
              online
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                : "border-amber-500/40 bg-amber-500/10 text-amber-300"
            }`}
            role="status"
          >
            <span className="relative flex h-2.5 w-2.5">
              <span
                className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${
                  online ? "bg-emerald-400" : "bg-amber-400"
                }`}
              />
              <span
                className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                  online ? "bg-emerald-400" : "bg-amber-400"
                }`}
              />
            </span>
            {online ? "AWS Connected • Lambda + DynamoDB + SNS" : "Reconnecting to AWS…"}
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        {/* Live impact strip */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Meals Saved"
            value={String(mealsSaved)}
            hint="Live opt-outs from students"
            tone="text-emerald-400"
            icon={
              <Icon className="h-4 w-4">
                <path d="M4 3v7a3 3 0 0 0 3 3v8M7 3v6M10 3v7a3 3 0 0 1-3 3M17 3c-2 2-3 5-3 8h3v10" />
              </Icon>
            }
          />
          <StatCard
            label="Food Waste Prevented"
            value={`${kgPrevented} kg`}
            hint={`${KG_PER_PLATE} kg per plate`}
            tone="text-sky-400"
            icon={
              <Icon className="h-4 w-4">
                <path d="M12 21c-4-2-7-5-7-9 0-4 3-7 7-9 4 2 7 5 7 9 0 4-3 7-7 9ZM12 8v8" />
              </Icon>
            }
          />
          <StatCard
            label="Est. Mess Savings"
            value={`₹${inrMessSavings}`}
            hint={`₹${INR_PER_PLATE} per plate`}
            tone="text-amber-400"
            icon={
              <Icon className="h-4 w-4">
                <path d="M7 5h10M7 9h10M9 5c4 0 5 2 5 4s-1 4-5 4H7l7 6" />
              </Icon>
            }
          />
          <StatCard
            label="Open Critical Alerts"
            value={String(openCritical)}
            hint={openCritical > 0 ? "Warden notified via SNS" : "All clear"}
            tone={openCritical > 0 ? "text-red-400" : "text-slate-300"}
            pulse={openCritical > 0}
            icon={
              <Icon className="h-4 w-4">
                <path d="M12 3 2 20h20L12 3ZM12 10v4M12 17h.01" />
              </Icon>
            }
          />
        </div>

        {notice && (
          <div
            role="status"
            className={`flex items-start justify-between gap-3 rounded-xl border p-3 text-sm ${
              notice.kind === "ok"
                ? "border-emerald-500/40 bg-emerald-900/40 text-emerald-200"
                : "border-red-500/40 bg-red-900/30 text-red-200"
            }`}
          >
            <span>{notice.text}</span>
            <button
              onClick={() => setNotice(null)}
              aria-label="Dismiss message"
              className="text-xs opacity-70 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        )}

        {/* ------------------------- STUDENT ------------------------- */}
        {tab === "student" && (
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Opt-out */}
            <Card>
              <form onSubmit={handleOptOut} className="space-y-5 p-6">
                <div>
                  <h2 className="text-lg font-semibold text-white">1-Tap Meal Opt-Out</h2>
                  <p className="mt-1 text-xs text-slate-400">
                    Skipping a meal? Tell the mess so food is not cooked for nobody.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1.5 text-xs text-slate-400">
                    Student ID
                    <input
                      value={studentId}
                      onChange={(e) => setStudentId(e.target.value)}
                      placeholder="e.g., STU_204"
                      className={inputCls}
                      required
                    />
                  </label>
                  <label className="space-y-1.5 text-xs text-slate-400">
                    Date
                    <input
                      type="date"
                      value={mealDate}
                      onChange={(e) => setMealDate(e.target.value)}
                      className={inputCls}
                      required
                    />
                  </label>
                </div>

                <div role="radiogroup" aria-label="Meal" className="grid grid-cols-3 gap-2">
                  {MEALS.map((m) => {
                    const active = mealType === m.id;
                    return (
                      <button
                        type="button"
                        key={m.id}
                        role="radio"
                        aria-checked={active}
                        onClick={() => setMealType(m.id)}
                        className={`rounded-xl border px-2 py-3 text-center transition ${
                          active
                            ? "border-emerald-400 bg-emerald-500/15 text-emerald-200 shadow-lg shadow-emerald-500/10"
                            : "border-slate-700 bg-slate-800/60 text-slate-300 hover:border-slate-500"
                        }`}
                      >
                        <span className="block text-xl">{m.emoji}</span>
                        <span className="mt-1 block text-sm font-semibold">{m.label}</span>
                        <span className="block text-[11px] text-slate-500">{m.time}</span>
                      </button>
                    );
                  })}
                </div>

                <button
                  disabled={loading}
                  className="w-full rounded-xl bg-emerald-500 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60"
                >
                  {loading ? "Saving..." : "Skip This Meal"}
                </button>

                {/* Personal impact */}
                <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                  <div className="flex items-baseline justify-between">
                    <p className="text-sm text-slate-200">
                      You have helped save <span className="font-bold text-emerald-400">{myKg} kg</span> of food
                    </p>
                    <span className="text-xs tabular-nums text-slate-500">
                      {myMeals}/{PERSONAL_GOAL_MEALS} meals
                    </span>
                  </div>
                  <div className="mt-2.5 h-2.5 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-all duration-700 ease-out"
                      style={{ width: `${myPct}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    {myMeals >= PERSONAL_GOAL_MEALS
                      ? "Goal reached. Thank you for cutting waste."
                      : `${PERSONAL_GOAL_MEALS - myMeals} more skipped meals to reach your monthly goal.`}
                  </p>
                </div>
              </form>
            </Card>

            {/* Ticket */}
            <Card>
              <form onSubmit={handleTicket} className="space-y-4 p-6">
                <div>
                  <h2 className="text-lg font-semibold text-white">Report Hostel Issue</h2>
                  <p className="mt-1 text-xs text-slate-400">
                    Urgent keywords such as &quot;spark&quot;, &quot;no water&quot; or &quot;short circuit&quot; email
                    the Warden instantly through SNS.
                  </p>
                </div>

                <div>
                  <p className="mb-2 text-xs text-slate-400">Demo presets</p>
                  <div className="flex flex-wrap gap-2">
                    {PRESETS.map((p) => (
                      <button
                        type="button"
                        key={p.label}
                        onClick={() => {
                          setCategory(p.category);
                          setDescription(p.description);
                        }}
                        className={`rounded-full border bg-slate-900/60 px-3 py-1.5 text-xs font-medium transition ${p.tone}`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1.5 text-xs text-slate-400">
                    Room
                    <input
                      value={room}
                      onChange={(e) => setRoom(e.target.value)}
                      placeholder="e.g., B-204"
                      className={inputCls}
                      required
                    />
                  </label>
                  <label className="space-y-1.5 text-xs text-slate-400">
                    Category
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className={inputCls}
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="space-y-2">
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe the issue..."
                    rows={4}
                    className={inputCls}
                    required
                  />
                  <div
                    className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-xs transition-colors duration-300 ${PRIORITY_STYLE[previewLevel]}`}
                    aria-live="polite"
                  >
                    <span className="text-slate-400">Priority preview</span>
                    <PriorityBadge priority={description.trim() ? previewLevel : "NORMAL"} />
                    <span className="text-slate-300">
                      {!description.trim()
                        ? "Start typing to see how this will be triaged."
                        : previewLevel === "CRITICAL"
                        ? "Will trigger an instant SNS alert to the Warden."
                        : previewLevel === "HIGH"
                        ? "Will be queued near the top for the maintenance team."
                        : "Will be added to the standard queue."}
                    </span>
                    {description.trim() && previewHits.length > 0 && (
                      <span className="text-slate-500">Matched: {previewHits.join(", ")}</span>
                    )}
                  </div>
                </div>

                <button
                  disabled={loading}
                  className="w-full rounded-xl bg-amber-500 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:opacity-60"
                >
                  {loading ? "Submitting..." : "Submit & Auto-Triage"}
                </button>
              </form>
            </Card>
          </div>
        )}

        {/* -------------------------- WARDEN -------------------------- */}
        {tab === "warden" && (
          <div className="space-y-6">
            {/* Forecaster */}
            <Card>
              <div className="space-y-6 p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-white">
                      Mess Demand Forecaster ({totalHostelers}-Bed Hostel)
                    </h2>
                    <p className="mt-1 text-xs text-slate-400">
                      Prediction updates from live opt-outs, menu and day type.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <div className="flex gap-1 rounded-xl border border-slate-800 bg-slate-950/60 p-1">
                      {(
                        [
                          ["regular", "Regular Menu"],
                          ["special", "Special (Biryani)"],
                        ] as const
                      ).map(([id, label]) => (
                        <button
                          key={id}
                          onClick={() => setMenuType(id)}
                          aria-pressed={menuType === id}
                          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                            menuType === id ? "bg-cyan-500 text-slate-950" : "text-slate-300 hover:bg-slate-800"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-1 rounded-xl border border-slate-800 bg-slate-950/60 p-1">
                      {(
                        [
                          ["weekday", "Weekday"],
                          ["weekend", "Weekend"],
                          ["exam", "Exam Mode"],
                        ] as const
                      ).map(([id, label]) => (
                        <button
                          key={id}
                          onClick={() => setDayMode(id)}
                          aria-pressed={dayMode === id}
                          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                            dayMode === id ? "bg-cyan-500 text-slate-950" : "text-slate-300 hover:bg-slate-800"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
                  <div className="space-y-4">
                    <BarRow
                      label="Default plates"
                      value={totalHostelers}
                      max={totalHostelers}
                      barClass="bg-slate-500"
                    />
                    <BarRow
                      label="Predicted plates"
                      value={predictedPlates}
                      max={totalHostelers}
                      barClass="bg-gradient-to-r from-emerald-500 to-emerald-300"
                    />
                    <BarRow
                      label="Live opt-outs"
                      value={activeOptOuts}
                      max={totalHostelers}
                      barClass="bg-gradient-to-r from-amber-500 to-amber-300"
                    />
                    <p className="text-xs text-slate-400">
                      Recommended prep:{" "}
                      <span className="font-semibold text-emerald-300">{prepTarget} plates</span> (predicted + 5%
                      safety buffer)
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-slate-800/60 p-4">
                      <p className="text-xs text-slate-400">Predicted Plates</p>
                      <p className="text-2xl font-bold tabular-nums text-emerald-400">{predictedPlates}</p>
                    </div>
                    <div className="rounded-xl bg-slate-800/60 p-4">
                      <p className="text-xs text-slate-400">Live Opt-Outs</p>
                      <p className="text-2xl font-bold tabular-nums text-white">{activeOptOuts}</p>
                    </div>
                    <div className="rounded-xl bg-slate-800/60 p-4">
                      <p className="text-xs text-slate-400">Food Waste Saved</p>
                      <p className="text-2xl font-bold tabular-nums text-sky-400">{kgFoodSaved} kg</p>
                    </div>
                    <div className="rounded-xl bg-slate-800/60 p-4">
                      <p className="text-xs text-slate-400">Est. Cost Saved</p>
                      <p className="text-2xl font-bold tabular-nums text-amber-400">₹{inrSaved}</p>
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            {/* Queue */}
            <Card>
              <div className="space-y-4 p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-white">
                    Auto-Triaged Maintenance Queue ({tickets.length})
                  </h2>
                  <button
                    onClick={fetchDashboard}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-emerald-300 transition hover:bg-slate-800"
                  >
                    <Icon className="h-3.5 w-3.5">
                      <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />
                    </Icon>
                    Refresh
                  </button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Priority filter">
                    {(["ALL", "CRITICAL", "HIGH", "NORMAL"] as const).map((f) => (
                      <button
                        key={f}
                        role="tab"
                        aria-selected={filter === f}
                        onClick={() => setFilter(f)}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                          filter === f
                            ? "border-emerald-400 bg-emerald-500/15 text-emerald-200"
                            : "border-slate-700 text-slate-400 hover:bg-slate-800"
                        }`}
                      >
                        {f}
                        <span className="ml-1.5 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] tabular-nums text-slate-300">
                          {counts[f]}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="relative w-full sm:w-64">
                    <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500">
                      <circle cx="11" cy="11" r="7" />
                      <path d="m20 20-3.5-3.5" />
                    </Icon>
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search room or keyword"
                      aria-label="Search tickets"
                      className={`${inputCls} pl-9`}
                    />
                  </div>
                </div>

                {tickets.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-400">
                    No tickets yet. Submit one from the Student Portal to test the triage flow.
                  </p>
                ) : visibleTickets.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-400">
                    No tickets match this filter. Clear the search or pick another priority.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {visibleTickets.map((t) => {
                      const critical = t.priority === "CRITICAL";
                      return (
                        <li
                          key={t.ticket_id}
                          className={`flex flex-col justify-between gap-3 rounded-xl border p-4 sm:flex-row sm:items-center ${
                            critical
                              ? "border-red-500/40 bg-red-500/5"
                              : "border-slate-700/80 bg-slate-800/40"
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              {critical && (
                                <span className="relative flex h-2.5 w-2.5">
                                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
                                </span>
                              )}
                              <PriorityBadge priority={t.priority} />
                              <span className="text-sm font-semibold">
                                Room {t.room} • {t.category}
                              </span>
                              {critical && (
                                <span className="flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-300">
                                  <Icon className="h-3 w-3">
                                    <path d="M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7ZM10 20a2 2 0 0 0 4 0" />
                                  </Icon>
                                  SNS Alert Sent
                                </span>
                              )}
                            </div>
                            <p className="mt-1.5 break-words text-sm text-slate-300">{t.description}</p>
                          </div>
                          <div className="shrink-0 text-left text-xs text-slate-400 sm:text-right">
                            <p className="font-medium text-slate-300">{formatIST(t.created_at)}</p>
                            <p className="mt-0.5">ID: {t.ticket_id}</p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </Card>
          </div>
        )}
      </main>

      {/* Architecture footer */}
      <footer className="relative z-10 mt-4 border-t border-slate-800/80 bg-slate-950/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {["AWS Amplify", "API Gateway", "Lambda (Python)"].map((n) => (
              <span key={n} className="flex items-center gap-2">
                <span className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 font-medium text-slate-200">
                  {n}
                </span>
                <Icon className="h-4 w-4 text-emerald-400">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </Icon>
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <span className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 font-medium text-cyan-200">
                DynamoDB
              </span>
              <span className="text-slate-500">+</span>
              <span className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 font-medium text-amber-200">
                Amazon SNS
              </span>
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Fully serverless on the AWS Free Tier • ap-southeast-2 • Built for Techfest IIT Bombay x AWS Campus to
            Cloud
          </p>
        </div>
      </footer>
    </div>
  );
}