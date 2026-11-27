"use client";

import React, { useEffect, useMemo, useState } from "react";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://1zsyi1450e.execute-api.ap-southeast-2.amazonaws.com";

const TOTAL_BEDS = 500;
const KG_PER_PLATE = 0.45;
const INR_PER_PLATE = 65;

type Priority = "CRITICAL" | "HIGH" | "NORMAL";
type MealType = "Breakfast" | "Lunch" | "Dinner";
type MenuType = "regular" | "special";
type DayType = "weekday" | "weekend" | "exam";
type UserRole = "student" | "warden";

interface AuthUser {
  user_id: string;
  role: UserRole;
  name: string;
  room: string;
}

interface Ticket {
  ticket_id: string;
  student_id?: string;
  room: string;
  category: string;
  description: string;
  priority: Priority;
  status: "OPEN" | "RESOLVED";
  created_at: string;
  resolved_at?: string;
  resolved_by?: string;
}

interface OptOut {
  optout_id: string;
  student_id: string;
  meal: MealType;
  date: string;
  created_at: string;
}

const CRITICAL_KEYWORDS = [
  "spark",
  "short circuit",
  "fire",
  "smoke",
  "shock",
  "electrocution",
  "no water",
  "gas leak",
  "flood",
  "burst pipe",
  "burning",
  "urgent",
];

const HIGH_KEYWORDS = [
  "leak",
  "water",
  "wi-fi",
  "wifi",
  "internet",
  "power",
  "outage",
  "ac",
  "fan",
  "cooler",
  "geyser",
  "broken lock",
  "clogged",
  "drain",
];

function previewPriority(description: string, category: string): Priority {
  const text = `${category} ${description}`.toLowerCase();
  if (CRITICAL_KEYWORDS.some((k) => text.includes(k))) return "CRITICAL";
  if (HIGH_KEYWORDS.some((k) => text.includes(k))) return "HIGH";
  return "NORMAL";
}

function formatTime(iso?: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function CampusPulse() {
  // Auth State
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [loginId, setLoginId] = useState("STU_204");
  const [loginPassword, setLoginPassword] = useState("student123");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // App State
  const [loading, setLoading] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Live AWS Data
  const [optouts, setOptouts] = useState<OptOut[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);

  // Student Portal — Meal Opt-Out
  const [mealDate, setMealDate] = useState(() =>
    new Date().toISOString().split("T")[0]
  );
  const [selectedMeal, setSelectedMeal] = useState<MealType>("Lunch");

  // Student Portal — Maintenance Ticket
  const [room, setRoom] = useState("B-204");
  const [category, setCategory] = useState("Electrical");
  const [description, setDescription] = useState("");

  // Warden Dashboard — Forecaster & Filters
  const [menuType, setMenuType] = useState<MenuType>("special");
  const [dayType, setDayType] = useState<DayType>("weekday");
  const [priorityFilter, setPriorityFilter] = useState<
    "ALL" | Priority | "RESOLVED"
  >("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Restore session from localStorage
  useEffect(() => {
    try {
      const savedUser = localStorage.getItem("campuspulse_user");
      const savedToken = localStorage.getItem("campuspulse_token");
      if (savedUser && savedToken) {
        const parsed: AuthUser = JSON.parse(savedUser);
        setAuthUser(parsed);
        setAuthToken(savedToken);
        if (parsed.role === "student" && parsed.room) {
          setRoom(parsed.room);
        }
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  const fetchDashboard = async () => {
    try {
      const res = await fetch(`${API_BASE}/dashboard`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setOptouts(Array.isArray(data.optouts) ? data.optouts : []);
      setTickets(Array.isArray(data.tickets) ? data.tickets : []);
      setErrorMsg(null);
    } catch (err) {
      console.error(err);
      setErrorMsg("Could not reach AWS API Gateway. Check API_BASE URL.");
    }
  };

  useEffect(() => {
    if (authUser) {
      fetchDashboard();
    }
  }, [authUser]);

  // Auth Handlers
  const performLogin = async (userId: string, password: string) => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId.trim(), password: password.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Invalid credentials");
      }
      setAuthUser(data.user);
      setAuthToken(data.token);
      if (data.user.role === "student" && data.user.room) {
        setRoom(data.user.room);
      }
      localStorage.setItem("campuspulse_user", JSON.stringify(data.user));
      localStorage.setItem("campuspulse_token", data.token);
      setStatusMsg(null);
      setErrorMsg(null);
    } catch (err: unknown) {
      setAuthError(
        err instanceof Error ? err.message : "Login failed. Check POST /login."
      );
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    setAuthUser(null);
    setAuthToken(null);
    setStatusMsg(null);
    setErrorMsg(null);
    localStorage.removeItem("campuspulse_user");
    localStorage.removeItem("campuspulse_token");
  };

  // Action Handlers
  const handleOptOut = async () => {
    if (!authUser) return;
    setLoading(true);
    setStatusMsg(null);
    setErrorMsg(null);
    try {
      const res = await fetch(`${API_BASE}/optout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_id: authUser.user_id,
          meal: selectedMeal,
          date: mealDate,
        }),
      });
      if (!res.ok) throw new Error("Failed to record opt-out");
      setStatusMsg(
        `Opted out of ${selectedMeal} (${mealDate}) for ${authUser.user_id}. Mess count updated!`
      );
      await fetchDashboard();
    } catch {
      setErrorMsg("Failed to submit meal opt-out.");
    } finally {
      setLoading(false);
    }
  };

  const handleTicket = async () => {
    if (!authUser) return;
    if (!description.trim()) {
      setErrorMsg("Please describe the hostel issue first.");
      return;
    }
    setLoading(true);
    setStatusMsg(null);
    setErrorMsg(null);
    try {
      const res = await fetch(`${API_BASE}/ticket`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_id: authUser.user_id,
          room: room.trim() || authUser.room || "Unknown",
          category,
          description: description.trim(),
        }),
      });
      if (!res.ok) throw new Error("Failed to submit ticket");
      const data = await res.json();
      const prio = data?.ticket?.priority || "NORMAL";
      setStatusMsg(
        prio === "CRITICAL"
          ? `CRITICAL ticket logged (${data?.ticket?.ticket_id}) — Instant AWS SNS alert sent to Warden!`
          : `Ticket logged (${data?.ticket?.ticket_id}) with ${prio} priority.`
      );
      setDescription("");
      await fetchDashboard();
    } catch {
      setErrorMsg("Failed to submit maintenance ticket.");
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async (ticketId: string) => {
    if (!authToken) return;
    setResolvingId(ticketId);
    setStatusMsg(null);
    setErrorMsg(null);
    try {
      const res = await fetch(`${API_BASE}/resolve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ ticket_id: ticketId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to resolve ticket");
      setStatusMsg(`Ticket ${ticketId} marked as RESOLVED in DynamoDB.`);
      await fetchDashboard();
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Could not resolve ticket. Check Warden auth."
      );
    } finally {
      setResolvingId(null);
    }
  };

  // Derived Metrics
  const liveOptOutsCount = optouts.length;
  const openCriticalCount = tickets.filter(
    (t) => t.priority === "CRITICAL" && t.status !== "RESOLVED"
  ).length;
  const resolvedCount = tickets.filter((t) => t.status === "RESOLVED").length;

  // Student-Specific Data
  const myOptOuts = useMemo(() => {
    if (!authUser) return [];
    return optouts
      .filter(
        (o) => o.student_id.toUpperCase() === authUser.user_id.toUpperCase()
      )
      .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  }, [optouts, authUser]);

  const myTickets = useMemo(() => {
    if (!authUser) return [];
    return tickets.filter(
      (t) =>
        (t.student_id || "").toUpperCase() === authUser.user_id.toUpperCase() ||
        t.room.toUpperCase() === authUser.room.toUpperCase()
    );
  }, [tickets, authUser]);

  // Mess Demand Forecast
  const forecast = useMemo(() => {
    let attendanceRate = 0.94;
    if (menuType === "regular") attendanceRate -= 0.06;
    if (dayType === "weekend") attendanceRate -= 0.14;
    if (dayType === "exam") attendanceRate -= 0.08;

    const baselinePlates = Math.round(TOTAL_BEDS * attendanceRate);
    const predictedPlates = Math.max(0, baselinePlates - liveOptOutsCount);
    const recommendedPrep = Math.min(
      TOTAL_BEDS,
      Math.round(predictedPlates * 1.05)
    );
    const platesSaved = Math.max(0, TOTAL_BEDS - predictedPlates);
    const kgSaved = (platesSaved * KG_PER_PLATE).toFixed(1);
    const inrSaved = platesSaved * INR_PER_PLATE;

    return {
      predictedPlates,
      recommendedPrep,
      platesSaved,
      kgSaved,
      inrSaved,
    };
  }, [menuType, dayType, liveOptOutsCount]);

  // Exportable Mess Prep Sheet (CSV)
  const handleDownloadPrepSheet = () => {
    const rows = [
      ["CampusPulse Mess Prep Sheet", new Date().toLocaleDateString("en-IN")],
      ["Hostel Capacity (Beds)", String(TOTAL_BEDS)],
      ["Menu Type", menuType === "special" ? "Special (Biryani)" : "Regular"],
      ["Day Type", dayType.toUpperCase()],
      ["Live Student Opt-Outs", String(liveOptOutsCount)],
      ["Predicted Plates", String(forecast.predictedPlates)],
      ["Recommended Prep (+5% Buffer)", String(forecast.recommendedPrep)],
      ["Estimated Food Waste Saved (kg)", forecast.kgSaved],
      ["Estimated Mess Savings (INR)", String(forecast.inrSaved)],
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `CampusPulse_MessPrep_${mealDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 7-Day Food Waste Savings Trend
  const weeklyTrend = useMemo(() => {
    const days = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Today"];
    const counts = [34, 52, 29, 36, 41, 33, liveOptOutsCount];
    return days.map((day, i) => ({
      day,
      optOuts: counts[i],
      kg: Number((counts[i] * KG_PER_PLATE).toFixed(1)),
      inr: counts[i] * INR_PER_PLATE,
      isToday: i === days.length - 1,
    }));
  }, [liveOptOutsCount]);

  const weeklyTotalKg = weeklyTrend
    .reduce((sum, d) => sum + d.kg, 0)
    .toFixed(1);
  const weeklyTotalInr = weeklyTrend.reduce((sum, d) => sum + d.inr, 0);
  const maxWeeklyKg = Math.max(...weeklyTrend.map((d) => d.kg), 1);

  // Filtered Tickets (Warden)
  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (priorityFilter === "RESOLVED" && t.status !== "RESOLVED") return false;
      if (
        priorityFilter !== "ALL" &&
        priorityFilter !== "RESOLVED" &&
        (t.priority !== priorityFilter || t.status === "RESOLVED")
      ) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          t.room.toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.ticket_id.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [tickets, priorityFilter, searchQuery]);

  const livePreview = previewPriority(description, category);

  // LOGIN SCREEN
  if (!authUser) {
    return (
      <div className="min-h-screen bg-[#060b14] text-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-[#0b1322] p-7 space-y-6 shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-400">
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.2}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 12h4l3-7 4 14 3-7h4"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">CampusPulse</h1>
              <p className="text-xs text-slate-400">
                Role-Based Hostel Portal • AWS Serverless
              </p>
            </div>
          </div>

          {authError && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-300">
              {authError}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              performLogin(loginId, loginPassword);
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Student ID or Warden ID
              </label>
              <input
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                placeholder="e.g., STU_204 or WARDEN_01"
                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Password
              </label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold py-3 text-sm transition cursor-pointer"
            >
              {authLoading ? "Signing in via AWS Lambda..." : "Sign In"}
            </button>
          </form>

          {/* 1-Click Judge Demo Logins */}
          <div className="border-t border-slate-800 pt-4 space-y-2.5">
            <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold text-center">
              1-Click Demo Access (For Judges)
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={authLoading}
                onClick={() => performLogin("STU_204", "student123")}
                className="rounded-xl border border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20 px-3 py-2.5 text-xs font-semibold text-cyan-300 transition cursor-pointer"
              >
                🎓 Demo Student
                <span className="block text-[10px] text-slate-400 font-normal mt-0.5">
                  STU_204 • Room B-204
                </span>
              </button>
              <button
                type="button"
                disabled={authLoading}
                onClick={() => performLogin("WARDEN_01", "warden123")}
                className="rounded-xl border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 px-3 py-2.5 text-xs font-semibold text-amber-300 transition cursor-pointer"
              >
                🛡️ Demo Warden
                <span className="block text-[10px] text-slate-400 font-normal mt-0.5">
                  WARDEN_01 • Admin
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#060b14] text-slate-100 font-sans selection:bg-emerald-500/30">
      {/* Top Navbar */}
      <header className="border-b border-slate-800/80 bg-[#080f1d]/90 backdrop-blur sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-400 font-bold">
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.2}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 12h4l3-7 4 14 3-7h4"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white">
                CampusPulse
              </h1>
              <p className="text-xs text-slate-400">
                {authUser.role === "warden"
                  ? "Warden Operations Console"
                  : "Student Hostel Portal"}
              </p>
            </div>
          </div>

          {/* Logged-in User Badge + Logout */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-900/90 text-xs">
              <span
                className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                  authUser.role === "warden"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                    : "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                }`}
              >
                {authUser.role}
              </span>
              <span className="text-white font-semibold">{authUser.name}</span>
              <span className="text-slate-500 hidden sm:inline">
                ({authUser.user_id} • {authUser.room})
              </span>
            </div>

            <button
              onClick={handleLogout}
              className="px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-slate-300 hover:text-white cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Status / Error Banner */}
        {statusMsg && (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300 flex items-center justify-between">
            <span>{statusMsg}</span>
            <button
              onClick={() => setStatusMsg(null)}
              className="text-emerald-400 hover:text-white text-xs ml-4"
            >
              ✕
            </button>
          </div>
        )}
        {errorMsg && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-300 flex items-center justify-between">
            <span>{errorMsg}</span>
            <button
              onClick={() => setErrorMsg(null)}
              className="text-rose-400 hover:text-white text-xs ml-4"
            >
              ✕
            </button>
          </div>
        )}

        {/* Live Impact Strip */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-slate-800/90 bg-[#0b1322] p-5">
            <p className="text-xs text-slate-400 font-medium">Meals Saved</p>
            <p className="text-3xl font-bold text-emerald-400 mt-2">
              {liveOptOutsCount}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Live opt-outs from students
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800/90 bg-[#0b1322] p-5">
            <p className="text-xs text-slate-400 font-medium">
              Food Waste Prevented
            </p>
            <p className="text-3xl font-bold text-cyan-400 mt-2">
              {(liveOptOutsCount * KG_PER_PLATE).toFixed(1)} kg
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {KG_PER_PLATE} kg per plate
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800/90 bg-[#0b1322] p-5">
            <p className="text-xs text-slate-400 font-medium">
              Est. Mess Savings
            </p>
            <p className="text-3xl font-bold text-amber-400 mt-2">
              ₹{(liveOptOutsCount * INR_PER_PLATE).toLocaleString("en-IN")}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              ₹{INR_PER_PLATE} per plate
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800/90 bg-[#0b1322] p-5">
            <p className="text-xs text-slate-400 font-medium">
              Open Critical Alerts
            </p>
            <p
              className={`text-3xl font-bold mt-2 ${
                openCriticalCount > 0 ? "text-rose-400" : "text-white"
              }`}
            >
              {openCriticalCount}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {openCriticalCount > 0
                ? "Warden notified via SNS"
                : `All clear • ${resolvedCount} resolved`}
            </p>
          </div>
        </section>

        {/* STUDENT PORTAL */}
        {authUser.role === "student" ? (
          <div className="space-y-6">
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 1-Tap Meal Opt-Out */}
              <div className="rounded-2xl border border-slate-800/90 bg-[#0b1322] p-6 flex flex-col justify-between space-y-5">
                <div className="space-y-4">
                  <div>
                    <h2 className="text-lg font-bold text-white">
                      1-Tap Meal Opt-Out
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Skipping a meal? Tell the mess so food is not cooked for
                      nobody.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">
                        Student ID
                      </label>
                      <input
                        value={authUser.user_id}
                        disabled
                        className="w-full rounded-xl bg-slate-950/60 border border-slate-800 px-3 py-2 text-sm text-slate-400 cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">
                        Date
                      </label>
                      <input
                        type="date"
                        value={mealDate}
                        onChange={(e) => setMealDate(e.target.value)}
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    {(
                      [
                        { name: "Breakfast", time: "7:30 – 9:00", icon: "🍳" },
                        { name: "Lunch", time: "12:30 – 2:00", icon: "🍛" },
                        { name: "Dinner", time: "7:30 – 9:00", icon: "🌙" },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.name}
                        type="button"
                        onClick={() => setSelectedMeal(m.name)}
                        className={`rounded-xl border p-3 text-center transition cursor-pointer ${
                          selectedMeal === m.name
                            ? "border-emerald-500 bg-emerald-500/15 text-white"
                            : "border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700"
                        }`}
                      >
                        <div className="text-xl mb-1">{m.icon}</div>
                        <div className="text-sm font-semibold">{m.name}</div>
                        <div className="text-[11px] text-slate-500">
                          {m.time}
                        </div>
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={handleOptOut}
                    disabled={loading}
                    className="w-full rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold py-3 text-sm transition cursor-pointer"
                  >
                    {loading ? "Updating AWS..." : "Skip This Meal"}
                  </button>
                </div>

                {/* Personal Savings Progress */}
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="text-slate-300">
                      You have helped save{" "}
                      <strong className="text-emerald-400">
                        {(myOptOuts.length * KG_PER_PLATE).toFixed(1)} kg
                      </strong>{" "}
                      of food
                    </span>
                    <span className="text-slate-500">
                      {myOptOuts.length}/20 meals
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all"
                      style={{
                        width: `${Math.min(100, (myOptOuts.length / 20) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Report Hostel Issue */}
              <div className="rounded-2xl border border-slate-800/90 bg-[#0b1322] p-6 space-y-4">
                <div>
                  <h2 className="text-lg font-bold text-white">
                    Report Hostel Issue
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Urgent keywords such as &quot;spark&quot;, &quot;no
                    water&quot; or &quot;short circuit&quot; email the Warden
                    instantly through SNS.
                  </p>
                </div>

                {/* Demo Presets */}
                <div className="space-y-1.5">
                  <p className="text-xs text-slate-500">Demo presets</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setRoom(authUser.room);
                        setCategory("Electrical");
                        setDescription(
                          "Switchboard spark and burning smell near study desk — urgent!"
                        );
                      }}
                      className="px-3 py-1.5 rounded-full text-xs font-medium border border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 cursor-pointer"
                    >
                      ⚡ Electrical Spark (Critical)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRoom(authUser.room);
                        setCategory("Plumbing");
                        setDescription(
                          "Water pipe leak in washroom corridor flooding the floor."
                        );
                      }}
                      className="px-3 py-1.5 rounded-full text-xs font-medium border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 cursor-pointer"
                    >
                      💧 Water Pipe Leak (High)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRoom(authUser.room);
                        setCategory("Furniture");
                        setDescription(
                          "Study chair leg is loose and needs repair."
                        );
                      }}
                      className="px-3 py-1.5 rounded-full text-xs font-medium border border-slate-700 bg-slate-800/60 text-slate-300 hover:bg-slate-800 cursor-pointer"
                    >
                      🪑 Chair Repair (Normal)
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Room
                    </label>
                    <input
                      value={room}
                      onChange={(e) => setRoom(e.target.value)}
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Category
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                    >
                      <option>Electrical</option>
                      <option>Plumbing</option>
                      <option>Wi-Fi</option>
                      <option>Furniture</option>
                      <option>General</option>
                    </select>
                  </div>
                </div>

                <textarea
                  rows={3}
                  placeholder="Describe the issue..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 p-3 text-sm text-white focus:outline-none focus:border-amber-500"
                />

                {/* Live Priority Preview */}
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-3.5 py-2.5 flex items-center gap-2.5 text-xs">
                  <span className="text-slate-400">Priority preview</span>
                  <span
                    className={`px-2 py-0.5 rounded font-bold ${
                      livePreview === "CRITICAL"
                        ? "bg-rose-500/20 text-rose-400 border border-rose-500/40"
                        : livePreview === "HIGH"
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                        : "bg-slate-800 text-slate-300"
                    }`}
                  >
                    {livePreview}
                  </span>
                  <span className="text-slate-500 truncate">
                    {description.trim()
                      ? livePreview === "CRITICAL"
                        ? "Will trigger instant Warden SNS email."
                        : "Will be queued in Warden Dashboard."
                      : "Start typing to see how this will be triaged."}
                  </span>
                </div>

                <button
                  onClick={handleTicket}
                  disabled={loading}
                  className="w-full rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold py-3 text-sm transition cursor-pointer"
                >
                  {loading ? "Triaging on AWS..." : "Submit & Auto-Triage"}
                </button>
              </div>
            </section>

            {/* Student Personal Trackers: My Reported Tickets + My Opt-Out History */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* My Reported Tickets */}
              <div className="rounded-2xl border border-slate-800/90 bg-[#0b1322] p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-white">
                    My Reported Tickets ({myTickets.length})
                  </h2>
                  <button
                    onClick={fetchDashboard}
                    className="text-xs text-slate-400 hover:text-white cursor-pointer"
                  >
                    ↻ Refresh
                  </button>
                </div>
                {myTickets.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No tickets reported for Room {authUser.room} yet.
                  </p>
                ) : (
                  <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                    {myTickets.map((t) => (
                      <div
                        key={t.ticket_id}
                        className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 flex items-center justify-between gap-3"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-semibold text-white">
                              {t.category} • Room {t.room}
                            </span>
                            <span className="text-slate-500">
                              ({t.ticket_id})
                            </span>
                          </div>
                          <p className="text-xs text-slate-400">
                            {t.description}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 px-2.5 py-1 rounded-md text-[11px] font-semibold ${
                            t.status === "RESOLVED"
                              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                              : "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                          }`}
                        >
                          {t.status === "RESOLVED" ? "✓ Resolved" : "Open"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* My Opt-Out History */}
              <div className="rounded-2xl border border-slate-800/90 bg-[#0b1322] p-6 space-y-4">
                <h2 className="text-base font-bold text-white">
                  My Meal Opt-Out History ({myOptOuts.length})
                </h2>
                {myOptOuts.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    You haven&apos;t skipped any meals yet.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {myOptOuts.map((o) => (
                      <div
                        key={o.optout_id}
                        className="rounded-xl border border-slate-800 bg-slate-950/70 px-3.5 py-2.5 flex items-center justify-between text-xs"
                      >
                        <span className="text-white font-medium">
                          {o.meal} • {o.date}
                        </span>
                        <span className="text-emerald-400 font-semibold">
                          Saved {KG_PER_PLATE} kg
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>
        ) : (
          /* WARDEN DASHBOARD */
          <div className="space-y-6">
            {/* Mess Demand Forecaster */}
            <section className="rounded-2xl border border-slate-800/90 bg-[#0b1322] p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-white">
                    Mess Demand Forecaster ({TOTAL_BEDS}-Bed Hostel)
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Prediction updates from live opt-outs, menu and day type.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                    <button
                      onClick={() => setMenuType("regular")}
                      className={`px-3 py-1.5 rounded-lg font-semibold cursor-pointer ${
                        menuType === "regular"
                          ? "bg-cyan-500 text-slate-950"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      Regular Menu
                    </button>
                    <button
                      onClick={() => setMenuType("special")}
                      className={`px-3 py-1.5 rounded-lg font-semibold cursor-pointer ${
                        menuType === "special"
                          ? "bg-cyan-500 text-slate-950"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      Special (Biryani)
                    </button>
                  </div>

                  <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                    {(["weekday", "weekend", "exam"] as const).map((d) => (
                      <button
                        key={d}
                        onClick={() => setDayType(d)}
                        className={`px-3 py-1.5 rounded-lg font-semibold capitalize cursor-pointer ${
                          dayType === d
                            ? "bg-cyan-500 text-slate-950"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        {d === "exam" ? "Exam Mode" : d}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={handleDownloadPrepSheet}
                    className="px-3 py-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-xs font-semibold cursor-pointer"
                  >
                    ⬇ Export Prep Sheet (CSV)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-400">Default plates</span>
                      <span className="font-bold text-white">{TOTAL_BEDS}</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-slate-800 overflow-hidden">
                      <div className="h-full bg-slate-500 w-full" />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-400">Predicted plates</span>
                      <span className="font-bold text-emerald-400">
                        {forecast.predictedPlates}
                      </span>
                    </div>
                    <div className="h-2.5 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-emerald-400 transition-all"
                        style={{
                          width: `${(forecast.predictedPlates / TOTAL_BEDS) * 100}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-400">Live opt-outs</span>
                      <span className="font-bold text-amber-400">
                        {liveOptOutsCount}
                      </span>
                    </div>
                    <div className="h-2.5 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-amber-400 transition-all"
                        style={{
                          width: `${Math.min(
                            100,
                            (liveOptOutsCount / TOTAL_BEDS) * 100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>

                  <p className="text-xs text-slate-400 pt-1">
                    Recommended prep:{" "}
                    <strong className="text-emerald-400">
                      {forecast.recommendedPrep} plates
                    </strong>{" "}
                    (predicted + 5% safety buffer)
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                    <p className="text-xs text-slate-400">Predicted Plates</p>
                    <p className="text-2xl font-bold text-emerald-400 mt-1">
                      {forecast.predictedPlates}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                    <p className="text-xs text-slate-400">Live Opt-Outs</p>
                    <p className="text-2xl font-bold text-white mt-1">
                      {liveOptOutsCount}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                    <p className="text-xs text-slate-400">Food Waste Saved</p>
                    <p className="text-2xl font-bold text-cyan-400 mt-1">
                      {forecast.kgSaved} kg
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                    <p className="text-xs text-slate-400">Est. Cost Saved</p>
                    <p className="text-2xl font-bold text-amber-400 mt-1">
                      ₹{forecast.inrSaved.toLocaleString("en-IN")}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* 7-Day Food Waste Savings Trend */}
            <section className="rounded-2xl border border-slate-800/90 bg-[#0b1322] p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-white">
                    7-Day Food Waste Saved Trend
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Weekly sustainability impact across the 500-bed hostel (Today
                    updates live from DynamoDB).
                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2">
                    <span className="text-slate-400 block">
                      7-Day Waste Saved
                    </span>
                    <strong className="text-cyan-400 text-sm">
                      {weeklyTotalKg} kg
                    </strong>
                  </div>
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                    <span className="text-slate-400 block">
                      7-Day Mess Savings
                    </span>
                    <strong className="text-amber-400 text-sm">
                      ₹{weeklyTotalInr.toLocaleString("en-IN")}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="w-full overflow-x-auto">
                <svg
                  viewBox="0 0 700 210"
                  className="w-full h-52 min-w-[520px]"
                  role="img"
                  aria-label="7-Day Food Waste Saved Bar Chart"
                >
                  {[40, 90, 140].map((y) => (
                    <line
                      key={y}
                      x1="20"
                      y1={y}
                      x2="680"
                      y2={y}
                      stroke="#1e293b"
                      strokeDasharray="4 4"
                    />
                  ))}

                  {weeklyTrend.map((d, i) => {
                    const barWidth = 54;
                    const gap = 94;
                    const x = 42 + i * gap;
                    const maxBarHeight = 120;
                    const barHeight = Math.max(
                      8,
                      (d.kg / maxWeeklyKg) * maxBarHeight
                    );
                    const y = 160 - barHeight;

                    return (
                      <g key={d.day}>
                        <rect
                          x={x}
                          y={y}
                          width={barWidth}
                          height={barHeight}
                          rx="8"
                          fill={d.isToday ? "#10b981" : "#22d3ee"}
                          fillOpacity={d.isToday ? "0.95" : "0.65"}
                        />
                        <text
                          x={x + barWidth / 2}
                          y={y - 8}
                          textAnchor="middle"
                          fill={d.isToday ? "#34d399" : "#cbd5e1"}
                          fontSize="11"
                          fontWeight="700"
                        >
                          {d.kg} kg
                        </text>
                        <text
                          x={x + barWidth / 2}
                          y="182"
                          textAnchor="middle"
                          fill={d.isToday ? "#ffffff" : "#94a3b8"}
                          fontSize="12"
                          fontWeight={d.isToday ? "700" : "500"}
                        >
                          {d.day}
                        </text>
                        <text
                          x={x + barWidth / 2}
                          y="198"
                          textAnchor="middle"
                          fill="#f59e0b"
                          fontSize="10"
                        >
                          ₹{d.inr.toLocaleString("en-IN")}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </section>

            {/* Auto-Triaged Maintenance Queue */}
            <section className="rounded-2xl border border-slate-800/90 bg-[#0b1322] p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-white">
                  Auto-Triaged Maintenance Queue ({tickets.length})
                </h2>
                <button
                  onClick={fetchDashboard}
                  className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-slate-200 cursor-pointer"
                >
                  ↻ Refresh
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  {(
                    ["ALL", "CRITICAL", "HIGH", "NORMAL", "RESOLVED"] as const
                  ).map((f) => {
                    const count =
                      f === "ALL"
                        ? tickets.length
                        : f === "RESOLVED"
                        ? resolvedCount
                        : tickets.filter(
                            (t) => t.priority === f && t.status !== "RESOLVED"
                          ).length;
                    return (
                      <button
                        key={f}
                        onClick={() => setPriorityFilter(f)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                          priorityFilter === f
                            ? "border-emerald-500 bg-emerald-500/15 text-emerald-300"
                            : "border-slate-800 bg-slate-950 text-slate-400 hover:text-white"
                        }`}
                      >
                        {f} <span className="ml-1 opacity-75">{count}</span>
                      </button>
                    );
                  })}
                </div>

                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search room or keyword..."
                  className="w-full sm:w-64 rounded-xl bg-slate-950 border border-slate-800 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              {filteredTickets.length === 0 ? (
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-8 text-center text-sm text-slate-500">
                  No tickets match this filter.
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredTickets.map((t) => (
                    <div
                      key={t.ticket_id}
                      className={`rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                        t.status === "RESOLVED"
                          ? "border-slate-800/70 bg-slate-950/40 opacity-75"
                          : t.priority === "CRITICAL"
                          ? "border-rose-500/40 bg-rose-500/5"
                          : "border-slate-800 bg-slate-950/70"
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              t.priority === "CRITICAL"
                                ? "bg-rose-500/20 text-rose-400 border border-rose-500/40"
                                : t.priority === "HIGH"
                                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                                : "bg-slate-800 text-slate-300"
                            }`}
                          >
                            {t.priority}
                          </span>
                          <span className="text-sm font-semibold text-white">
                            Room {t.room} • {t.category}
                          </span>
                          <span className="text-xs text-slate-500">
                            ({t.ticket_id})
                          </span>
                        </div>
                        <p className="text-sm text-slate-300">
                          {t.description}
                        </p>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs text-slate-500">
                          {formatTime(t.created_at)}
                        </span>
                        {t.status === "RESOLVED" ? (
                          <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            ✓ Resolved
                          </span>
                        ) : (
                          <button
                            onClick={() => handleResolve(t.ticket_id)}
                            disabled={resolvingId === t.ticket_id}
                            className="px-3 py-1.5 rounded-md text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 transition cursor-pointer"
                          >
                            {resolvingId === t.ticket_id
                              ? "Resolving..."
                              : "Mark Resolved"}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {/* Architecture Footer */}
        <footer className="rounded-2xl border border-slate-800/80 bg-[#080f1d] p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            {["AWS Amplify / S3", "API Gateway", "Lambda (Python + RBAC)"].map(
              (svc) => (
                <span key={svc} className="flex items-center gap-2">
                  <span className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-slate-200 font-medium">
                    {svc}
                  </span>
                  <span className="text-slate-600">→</span>
                </span>
              )
            )}
            <span className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1 text-cyan-300 font-medium">
              DynamoDB
            </span>
            <span className="text-slate-500">+</span>
            <span className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-amber-300 font-medium">
              Amazon SNS
            </span>
          </div>
          <p className="text-slate-500">
            Fully serverless on the AWS Free Tier • ap-southeast-2
          </p>
        </footer>
      </main>
    </div>
  );
}