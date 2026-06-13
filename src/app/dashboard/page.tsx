"use client";

import React, { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";

interface GroupSummary {
  id: string;
  name: string;
  description: string;
  avatarUrl: string;
  updatedAt: string;
  netBalance: number;
  memberCount: number;
}

interface RecentActivity {
  id: string;
  type: string;
  description: string;
  amount: number;
  date: string;
  creatorName: string;
  groupName: string;
}

interface ChartItem {
  name: string;
  value: number;
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Dashboard States
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [totalBalance, setTotalBalance] = useState(0);
  const [totalYouOwe, setTotalYouOwe] = useState(0);
  const [totalYouAreOwed, setTotalYouAreOwed] = useState(0);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [chartData, setChartData] = useState<ChartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Group Create Dialog States
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDesc, setNewGroupDesc] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Chart Rendering Guard (Prevents SSR mismatch)
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/dashboard");
      if (!res.ok) {
        throw new Error("Failed to load dashboard data");
      }
      const data = await res.json();
      setGroups(data.groups);
      setTotalBalance(data.totalBalance);
      setTotalYouOwe(data.totalYouOwe);
      setTotalYouAreOwed(data.totalYouAreOwed);
      setRecentActivity(data.recentActivity);
      setChartData(data.chartData);
    } catch (err: any) {
      setError(err.message || "Something went wrong while fetching data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    } else if (status === "authenticated") {
      fetchDashboardData();
    }
  }, [status, router]);

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    if (!newGroupName.trim()) {
      setCreateError("Group name is required");
      return;
    }

    setCreateLoading(true);

    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newGroupName,
          description: newGroupDesc
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to create group");
      }

      setNewGroupName("");
      setNewGroupDesc("");
      setShowCreateDialog(false);
      // Refresh list
      fetchDashboardData();
    } catch (err: any) {
      setCreateError(err.message || "Failed to create group");
    } finally {
      setCreateLoading(false);
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-gradient-mesh flex items-center justify-center text-slate-100">
        <div className="flex flex-col items-center gap-4">
          <svg className="animate-spin h-8 w-8 text-teal-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm font-medium text-slate-400">Loading your split board...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-mesh flex items-center justify-center text-slate-100">
        <div className="glass-card p-8 rounded-2xl max-w-md text-center border border-red-500/20">
          <h2 className="text-lg font-bold text-red-400 mb-2">Error Loading Dashboard</h2>
          <p className="text-sm text-slate-400 mb-6">{error}</p>
          <button
            onClick={fetchDashboardData}
            className="px-6 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 hover:border-slate-700 transition-colors cursor-pointer"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const COLORS = ["#0d9488", "#4f46e5", "#f59e0b", "#10b981", "#ef4444", "#3b82f6"];

  return (
    <div className="min-h-screen bg-gradient-mesh text-slate-100 flex flex-col font-sans pb-16">
      {/* Navbar */}
      <header className="sticky top-0 z-40 glass-panel border-b border-slate-800/50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20 font-bold text-sm tracking-wider">
              W
            </span>
            <span className="font-bold text-lg tracking-tight text-slate-100">WanderLust</span>
          </Link>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2.5">
              {session?.user?.image ? (
                <img
                  src={session.user.image}
                  alt={session.user.name || "User"}
                  className="w-8 h-8 rounded-full border border-slate-800 bg-slate-900"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-teal-500/20 text-teal-400 border border-teal-500/30 flex items-center justify-center text-xs font-bold">
                  {session?.user?.name ? session.user.name.charAt(0) : "U"}
                </div>
              )}
              <span className="hidden sm:inline text-sm font-medium text-slate-300">
                {session?.user?.name}
              </span>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="p-2 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-900 transition-colors text-sm font-medium cursor-pointer"
            >
              Log Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Grid Content */}
      <main className="max-w-6xl mx-auto px-6 mt-10 w-full flex-1 flex flex-col gap-8">
        
        {/* Top Header Card */}
        <section className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-100">Dashboard</h1>
            <p className="text-sm text-slate-400 mt-1">Split balances and manage shared tabs.</p>
          </div>
          <button
            onClick={() => setShowCreateDialog(true)}
            className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-medium text-sm transition-all shadow-md hover:shadow-teal-500/10 active:scale-[0.98] cursor-pointer"
          >
            Create a Group
          </button>
        </section>

        {/* Balance Summaries Card */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="glass-card p-6 rounded-2xl border border-slate-800/40 relative overflow-hidden">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Net Balance</p>
            <p className={`text-3xl font-black mt-2 ${totalBalance >= 0 ? "text-teal-400" : "text-amber-500"}`}>
              {totalBalance >= 0 ? `+$${totalBalance.toFixed(2)}` : `-$${Math.abs(totalBalance).toFixed(2)}`}
            </p>
            <p className="text-xs text-slate-500 mt-1">Aggregated across all groups</p>
          </div>

          <div className="glass-card p-6 rounded-2xl border border-slate-800/40 relative overflow-hidden">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">You Owe Overall</p>
            <p className="text-3xl font-black mt-2 text-amber-500">
              ${totalYouOwe.toFixed(2)}
            </p>
            <p className="text-xs text-slate-500 mt-1">Active debts needing settlement</p>
          </div>

          <div className="glass-card p-6 rounded-2xl border border-slate-800/40 relative overflow-hidden">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">You Are Owed Overall</p>
            <p className="text-3xl font-black mt-2 text-teal-400">
              ${totalYouAreOwed.toFixed(2)}
            </p>
            <p className="text-xs text-slate-500 mt-1">Pending payments from others</p>
          </div>
        </section>

        {/* Lower layout grids */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Groups list */}
          <section className="lg:col-span-2 flex flex-col gap-4">
            <h2 className="text-lg font-bold text-slate-200">My Groups</h2>

            {groups.length === 0 ? (
              <div className="glass-card p-12 rounded-2xl border border-slate-800/40 text-center flex flex-col items-center">
                <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 flex items-center justify-center text-lg font-bold mb-4">
                  👥
                </div>
                <h3 className="text-sm font-bold text-slate-200 mb-1">No Groups Yet</h3>
                <p className="text-xs text-slate-400 max-w-xs mb-6">
                  You are not a member of any groups. Create a group to start tracking expenses with roommates or friends.
                </p>
                <button
                  onClick={() => setShowCreateDialog(true)}
                  className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-medium text-xs transition-colors cursor-pointer"
                >
                  Create Group
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {groups.map((group) => (
                  <Link
                    key={group.id}
                    href={`/groups/${group.id}`}
                    className="glass-card p-5 rounded-2xl border border-slate-800/40 hover:border-slate-700/60 transition-all hover:translate-y-[-2px] duration-200 flex flex-col justify-between"
                  >
                    <div className="flex items-start gap-4">
                      {group.avatarUrl ? (
                        <img
                          src={group.avatarUrl}
                          alt={group.name}
                          className="w-12 h-12 rounded-xl border border-slate-800 bg-slate-900"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-teal-500/20 text-teal-400 border border-teal-500/30 flex items-center justify-center font-bold">
                          {group.name.charAt(0)}
                        </div>
                      )}
                      <div>
                        <h3 className="font-bold text-slate-100 hover:text-teal-400 transition-colors text-sm line-clamp-1">
                          {group.name}
                        </h3>
                        <p className="text-xs text-slate-400 line-clamp-2 mt-1">
                          {group.description || "Tahoe trip expenses..."}
                        </p>
                      </div>
                    </div>

                    <div className="mt-6 pt-4 border-t border-slate-850 flex items-center justify-between">
                      <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-500">
                        {group.memberCount} member{group.memberCount !== 1 ? "s" : ""}
                      </span>
                      <div className="text-right">
                        {group.netBalance > 0 ? (
                          <span className="text-xs text-teal-400 font-semibold">
                            owes you ${group.netBalance.toFixed(2)}
                          </span>
                        ) : group.netBalance < 0 ? (
                          <span className="text-xs text-amber-500 font-semibold">
                            you owe ${Math.abs(group.netBalance).toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500">settled up</span>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Right hand stats & history */}
          <aside className="flex flex-col gap-8">
            
            {/* Chart Section */}
            {mounted && chartData.length > 0 && (
              <section className="glass-card p-6 rounded-2xl border border-slate-800/40">
                <h3 className="text-sm font-bold text-slate-200 mb-4">Spending by Category</h3>
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={chartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={70}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#0f172a",
                          border: "1px solid rgba(255,255,255,0.08)",
                          borderRadius: "12px",
                          color: "#f8fafc"
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                {/* Legend list */}
                <div className="grid grid-cols-2 gap-2 mt-4 text-xs">
                  {chartData.map((item, idx) => (
                    <div key={item.name} className="flex items-center gap-1.5 text-slate-400">
                      <span
                        className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
                        style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                      ></span>
                      <span className="truncate">{item.name}: ${item.value}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Recent activity log */}
            <section className="glass-card p-6 rounded-2xl border border-slate-800/40 flex flex-col gap-4">
              <h3 className="text-sm font-bold text-slate-200">Recent Activity</h3>
              {recentActivity.length === 0 ? (
                <p className="text-xs text-slate-500">No recent transactions recorded.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {recentActivity.map((activity) => (
                    <div key={activity.id} className="text-xs border-b border-slate-850 pb-2 last:border-0 last:pb-0">
                      <div className="flex items-center justify-between text-slate-300">
                        <span className="font-semibold">{activity.description}</span>
                        <span className="text-slate-400">${activity.amount.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                        <span>Paid by {activity.creatorName} in {activity.groupName}</span>
                        <span>{new Date(activity.date).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </aside>
        </div>
      </main>

      {/* Modal Dialog for Group Creation */}
      {showCreateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-md glass-card rounded-2xl p-6 border border-slate-850 relative">
            <button
              onClick={() => setShowCreateDialog(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-100 text-sm cursor-pointer"
            >
              ✕
            </button>
            <h2 className="text-lg font-bold text-slate-100 mb-4">Create a New Group</h2>

            {createError && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateGroup} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Group Name
                </label>
                <input
                  type="text"
                  required
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="e.g. Tahoe Cabin Trip"
                  className="w-full px-4 py-2.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Description
                </label>
                <textarea
                  value={newGroupDesc}
                  onChange={(e) => setNewGroupDesc(e.target.value)}
                  placeholder="groceries, renting equipment, etc."
                  rows={3}
                  className="w-full px-4 py-2.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="flex gap-3 justify-end pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateDialog(false)}
                  className="px-4 py-2 rounded-lg border border-slate-800 hover:bg-slate-900 text-slate-300 font-medium text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-medium text-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {createLoading ? "Creating..." : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
