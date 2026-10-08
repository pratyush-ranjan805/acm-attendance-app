"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { api, MealParticipant, MealTypeItem, MealsSummary, today, fmtDate } from "@/lib/api";
import { Skeleton, useToast } from "@/components/ui";

export default function MealsPage() {
  const [date, setDate] = useState(today());
  const [data, setData] = useState<MealsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filter state
  const [search, setSearch] = useState("");
  const [selectedTeam, setSelectedTeam] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "served" | "unserved">("all");

  // Active meal for 1-click marking
  const [activeMealKey, setActiveMealKey] = useState<string>("day1_dinner");

  // Custom meal input
  const [showAddMeal, setShowAddMeal] = useState(false);
  const [newMealName, setNewMealName] = useState("");
  const [customMealTypes, setCustomMealTypes] = useState<MealTypeItem[]>([]);

  // Toggling state tracker to avoid duplicate clicks
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());

  const toast = useToast();

  const loadData = useCallback(async (selectedDate: string) => {
    try {
      setError(null);
      const res = await api.mealsData(selectedDate);
      setData(res);
      // If activeMealKey not in returned list, select first available
      if (res.mealTypes.length > 0 && !res.mealTypes.some((m) => m.key === activeMealKey)) {
        setActiveMealKey(res.mealTypes[0].key);
      }
    } catch (e) {
      setError((e as Error).message || "Failed to load meals data");
    } finally {
      setLoading(false);
    }
  }, [activeMealKey]);

  useEffect(() => {
    loadData(date);
  }, [date, loadData]);

  // Combined meal types (server discovered + client session added)
  const allMealTypes = useMemo(() => {
    const list = [...(data?.mealTypes || [])];
    for (const c of customMealTypes) {
      if (!list.some((m) => m.key === c.key)) {
        list.push(c);
      }
    }
    return list;
  }, [data?.mealTypes, customMealTypes]);

  // Current active meal item
  const activeMeal = useMemo(() => {
    return allMealTypes.find((m) => m.key === activeMealKey) || allMealTypes[0] || {
      key: "day1_dinner",
      label: "Day 1 – Dinner",
      icon: "🍛",
    };
  }, [allMealTypes, activeMealKey]);

  // Add a new custom meal globally
  const handleAddCustomMeal = () => {
    const label = newMealName.trim();
    if (!label) return;
    const key = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40);

    if (allMealTypes.some((m) => m.key === key)) {
      toast("Meal with this name already exists", false);
      return;
    }

    const newItem: MealTypeItem = { key, label, icon: "🍽️" };
    setCustomMealTypes((prev) => [...prev, newItem]);
    setActiveMealKey(key);
    setNewMealName("");
    setShowAddMeal(false);
    toast(`Added "${label}" to meals list`);
  };

  // Toggle meal for a single participant (optimistic UI)
  const handleToggleMeal = async (participant: MealParticipant, mealKey: string) => {
    if (!data) return;
    const currentVal = !!participant.meals[mealKey];
    const newVal = !currentVal;
    const actionKey = `${participant.profileId}_${mealKey}`;

    if (updatingIds.has(actionKey)) return;

    setUpdatingIds((prev) => new Set(prev).add(actionKey));

    // Optimistically update local state
    setData((prev) => {
      if (!prev) return prev;
      const updatedList = prev.participants.map((p) => {
        if (p.profileId === participant.profileId) {
          const nextMeals = { ...p.meals, [mealKey]: newVal };
          return {
            ...p,
            meals: nextMeals,
            updatedBy: "You",
            updatedAt: new Date().toISOString(),
          };
        }
        return p;
      });

      const updatedCounts = { ...prev.stats.mealCounts };
      updatedCounts[mealKey] = Math.max(0, (updatedCounts[mealKey] || 0) + (newVal ? 1 : -1));

      return {
        ...prev,
        participants: updatedList,
        stats: {
          ...prev.stats,
          mealCounts: updatedCounts,
        },
      };
    });

    try {
      await api.updateMeal({
        date,
        profileId: participant.profileId,
        teamId: participant.teamId,
        mealKey,
        value: newVal,
      });

      const mealLabel = allMealTypes.find((m) => m.key === mealKey)?.label || mealKey;
      if (newVal) {
        toast(`✓ Marked ${mealLabel} for ${participant.name}`);
      } else {
        toast(`Removed ${mealLabel} from ${participant.name}`);
      }
    } catch (e) {
      // Rollback on error
      toast(`Failed to update: ${(e as Error).message}`, false);
      await loadData(date);
    } finally {
      setUpdatingIds((prev) => {
        const next = new Set(prev);
        next.delete(actionKey);
        return next;
      });
    }
  };

  // Batch toggle for an entire team
  const handleMarkTeam = async (teamId: string, teamName: string, mealKey: string, value: boolean) => {
    if (!data) return;
    const teamMembers = data.participants.filter((p) => p.teamId === teamId);
    if (teamMembers.length === 0) return;

    const updates = teamMembers.map((m) => ({
      profileId: m.profileId,
      teamId: m.teamId,
      meals: { ...(m.meals || {}), [mealKey]: value },
    }));

    // Optimistically update
    setData((prev) => {
      if (!prev) return prev;
      const updatedList = prev.participants.map((p) => {
        if (p.teamId === teamId) {
          return {
            ...p,
            meals: { ...p.meals, [mealKey]: value },
            updatedBy: "You",
            updatedAt: new Date().toISOString(),
          };
        }
        return p;
      });
      return { ...prev, participants: updatedList };
    });

    try {
      await api.batchUpdateMeals({ date, updates });
      const mealLabel = allMealTypes.find((m) => m.key === mealKey)?.label || mealKey;
      toast(`Updated ${mealLabel} for entire team "${teamName}"`);
      await loadData(date);
    } catch (e) {
      toast(`Failed: ${(e as Error).message}`, false);
      await loadData(date);
    }
  };

  // List of all unique teams for filter dropdown
  const uniqueTeams = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, { id: string; name: string; code: string }>();
    for (const p of data.participants) {
      if (!map.has(p.teamId)) {
        map.set(p.teamId, { id: p.teamId, name: p.teamName, code: p.teamCode });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
  }, [data]);

  // Filtered participants based on Search, Team, and Meal Status
  const filteredParticipants = useMemo(() => {
    if (!data) return [];
    let list = data.participants;

    // Filter by team
    if (selectedTeam !== "all") {
      list = list.filter((p) => p.teamId === selectedTeam);
    }

    // Filter by served status for active meal
    if (statusFilter === "served") {
      list = list.filter((p) => !!p.meals[activeMealKey]);
    } else if (statusFilter === "unserved") {
      list = list.filter((p) => !p.meals[activeMealKey]);
    }

    // Filter by search query (Student name, Reg No, Team name, Team code)
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.regNo.toLowerCase().includes(q) ||
          p.teamName.toLowerCase().includes(q) ||
          p.teamCode.toLowerCase().includes(q) ||
          p.phone.toLowerCase().includes(q)
      );
    }

    return list;
  }, [data, selectedTeam, statusFilter, search, activeMealKey]);

  // Stats for the active meal
  const activeMealServedCount = useMemo(() => {
    if (!data) return 0;
    return data.stats.mealCounts[activeMealKey] || 0;
  }, [data, activeMealKey]);

  const totalCount = data?.stats.totalParticipants || 0;
  const servedPercentage = totalCount > 0 ? Math.round((activeMealServedCount / totalCount) * 100) : 0;

  return (
    <div className="space-y-6 pb-24 max-w-7xl mx-auto">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <span>🍽️</span> Meal Management & Distribution
          </h1>
          <p className="text-sm text-white/60 mt-1">
            Search by student name, registration number, or team to quickly grant and track meals.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5">
            <span className="text-xs text-white/50">Date:</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-transparent text-sm text-white focus:outline-none cursor-pointer"
            />
          </div>

          <button
            onClick={() => loadData(date)}
            disabled={loading}
            className="btn-ghost !p-2 text-white/70 hover:text-white"
            title="Refresh list"
          >
            🔄
          </button>
        </div>
      </div>

      {/* ── Quick Stats Bar ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card p-4 border border-white/10 bg-white/[0.02]">
          <p className="text-xs text-white/50">Total Registered</p>
          <p className="text-2xl font-bold text-white mt-1">{totalCount}</p>
          <p className="text-[11px] text-white/40 mt-0.5">Across all eligible teams</p>
        </div>

        <div className="card p-4 border border-white/10 bg-white/[0.02]">
          <p className="text-xs text-white/50">Active Meal ({activeMeal.label})</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold text-green-400">{activeMealServedCount}</span>
            <span className="text-xs text-white/40">/ {totalCount} served</span>
          </div>
          <div className="w-full bg-white/10 h-1.5 rounded-full mt-2 overflow-hidden">
            <div
              className="bg-green-500 h-full rounded-full transition-all duration-300"
              style={{ width: `${servedPercentage}%` }}
            />
          </div>
        </div>

        <div className="card p-4 border border-white/10 bg-white/[0.02]">
          <p className="text-xs text-white/50">Distribution Rate</p>
          <p className="text-2xl font-bold text-orange-400 mt-1">{servedPercentage}%</p>
          <p className="text-[11px] text-white/40 mt-0.5">For {activeMeal.label}</p>
        </div>

        <div className="card p-4 border border-white/10 bg-white/[0.02]">
          <p className="text-xs text-white/50">Pending Distribution</p>
          <p className="text-2xl font-bold text-yellow-400 mt-1">
            {Math.max(0, totalCount - activeMealServedCount)}
          </p>
          <p className="text-[11px] text-white/40 mt-0.5">Yet to receive meal</p>
        </div>
      </div>

      {/* ── Active Meal Selector & Global Meal Types Bar ─────────────────────── */}
      <div className="card p-4 border border-white/10 bg-neutral-900/40 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase font-semibold text-white/50 tracking-wider">
              Select Active Meal Slot:
            </span>
            <span className="text-xs text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded border border-orange-500/20 font-medium">
              1-Click Mark Mode
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowAddMeal(!showAddMeal)}
            className="text-xs text-orange-400 hover:text-orange-300 flex items-center gap-1 font-medium"
          >
            <span>+</span> Add Custom Meal Slot
          </button>
        </div>

        {/* Meal slot pills */}
        <div className="flex flex-wrap items-center gap-2">
          {allMealTypes.map((m) => {
            const isSelected = activeMealKey === m.key;
            const count = data?.stats.mealCounts[m.key] || 0;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setActiveMealKey(m.key)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all ${
                  isSelected
                    ? "bg-orange-500 text-black border-orange-400 shadow-md shadow-orange-500/20 scale-[1.02]"
                    : "bg-white/5 border-white/10 text-white/80 hover:bg-white/10 hover:text-white"
                }`}
              >
                <span>{m.icon || "🍽️"}</span>
                <span>{m.label}</span>
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                    isSelected ? "bg-black/20 text-black" : "bg-white/10 text-white/60"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Inline custom meal creator */}
        {showAddMeal && (
          <div className="pt-2 flex items-center gap-2 max-w-md animate-in fade-in duration-200">
            <input
              type="text"
              value={newMealName}
              onChange={(e) => setNewMealName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddCustomMeal()}
              placeholder="e.g. Day 2 Lunch, Midnight Pizza..."
              className="input !py-1.5 !text-xs bg-white/5 border-white/20 flex-1"
              autoFocus
            />
            <button
              type="button"
              onClick={handleAddCustomMeal}
              className="btn !py-1.5 !px-4 !text-xs !bg-orange-500 font-semibold"
            >
              Add Meal
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAddMeal(false);
                setNewMealName("");
              }}
              className="btn-ghost !py-1.5 !px-3 !text-xs text-white/60"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* ── Search & Filter Controls (Student Name / Reg No / Team) ──────────── */}
      <div className="card p-4 border border-white/10 bg-white/[0.01] space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Main search input */}
          <div className="md:col-span-6 relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍 Search by Student Name, Reg No (RA23...), Team Name or Code..."
              className="input !pl-10 !py-2.5 !text-sm bg-white/5 border-white/10 w-full"
            />
            <span className="absolute left-3.5 top-3 text-white/40 text-sm pointer-events-none">
              🔍
            </span>
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-3 top-2.5 text-white/40 hover:text-white text-sm"
              >
                ✕
              </button>
            )}
          </div>

          {/* Team Dropdown */}
          <div className="md:col-span-3">
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="input !py-2.5 !text-sm bg-neutral-900 border-white/10 w-full text-white cursor-pointer"
            >
              <option value="all">All Teams ({uniqueTeams.length})</option>
              {uniqueTeams.map((t) => (
                <option key={t.id} value={t.id}>
                  [{t.code}] {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* Served Filter */}
          <div className="md:col-span-3">
            <div className="flex rounded-lg bg-white/5 p-1 border border-white/10">
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
                  statusFilter === "all" ? "bg-white/10 text-white shadow-sm" : "text-white/50 hover:text-white"
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("served")}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
                  statusFilter === "served"
                    ? "bg-green-500/20 text-green-400 shadow-sm"
                    : "text-white/50 hover:text-white"
                }`}
              >
                ✓ Served
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("unserved")}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
                  statusFilter === "unserved"
                    ? "bg-amber-500/20 text-amber-300 shadow-sm"
                    : "text-white/50 hover:text-white"
                }`}
              >
                ○ Pending
              </button>
            </div>
          </div>
        </div>

        {/* Results summary & Active Team batch action */}
        <div className="flex items-center justify-between text-xs text-white/50 pt-1 flex-wrap gap-2">
          <span>
            Showing <strong className="text-white">{filteredParticipants.length}</strong> of {totalCount}{" "}
            participants
            {search.trim() && (
              <span>
                {" "}
                matching &ldquo;<span className="text-orange-400">{search}</span>&rdquo;
              </span>
            )}
          </span>

          {selectedTeam !== "all" && filteredParticipants.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-white/60">Batch team action for {activeMeal.label}:</span>
              <button
                type="button"
                onClick={() =>
                  handleMarkTeam(
                    selectedTeam,
                    filteredParticipants[0]?.teamName || "Team",
                    activeMealKey,
                    true
                  )
                }
                className="btn !py-1 !px-3 !text-[11px] !bg-green-500/20 text-green-300 border border-green-500/30 hover:!bg-green-500/30 font-semibold"
              >
                ✓ Mark Entire Team Served
              </button>
              <button
                type="button"
                onClick={() =>
                  handleMarkTeam(
                    selectedTeam,
                    filteredParticipants[0]?.teamName || "Team",
                    activeMealKey,
                    false
                  )
                }
                className="btn-ghost !py-1 !px-2.5 !text-[11px] text-red-400/80 hover:text-red-400"
              >
                Clear Team
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Participants List ─────────────────────────────────────────────────── */}
      {loading ? (
        <Skeleton rows={6} />
      ) : error ? (
        <div className="card p-6 border border-red-500/20 bg-red-500/5 text-center text-red-400">
          <p className="font-semibold">Error loading meals</p>
          <p className="text-xs mt-1 text-white/60">{error}</p>
          <button
            onClick={() => loadData(date)}
            className="btn mt-4 !py-1.5 !px-4 !text-xs !bg-orange-500"
          >
            Retry
          </button>
        </div>
      ) : filteredParticipants.length === 0 ? (
        <div className="card p-12 text-center border border-white/10 bg-white/[0.01]">
          <p className="text-3xl mb-2">🍽️</p>
          <p className="text-base font-medium text-white">No participants found</p>
          <p className="text-xs text-white/50 mt-1 max-w-sm mx-auto">
            {search.trim()
              ? `No student matching "${search}" found in registered teams.`
              : "No eligible participants available for this date."}
          </p>
          {search && (
            <button
              onClick={() => setSearch("")}
              className="btn-ghost !text-xs text-orange-400 mt-3"
            >
              Clear search filter
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredParticipants.map((p) => {
            const isServedActive = !!p.meals[activeMealKey];
            const actionKey = `${p.profileId}_${activeMealKey}`;
            const isUpdating = updatingIds.has(actionKey);

            return (
              <div
                key={p.profileId}
                className={`card p-3.5 border transition-all flex flex-col md:flex-row md:items-center justify-between gap-3.5 ${
                  isServedActive
                    ? "bg-green-950/10 border-green-500/20 hover:border-green-500/40"
                    : "bg-white/[0.02] border-white/10 hover:border-white/20"
                }`}
              >
                {/* Student Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-white text-base truncate">{p.name}</span>
                    {p.role === "Leader" && (
                      <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300 border border-orange-500/30">
                        Leader
                      </span>
                    )}
                    {p.attendanceStatus === "Present" ? (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        ● Present in venue
                      </span>
                    ) : p.attendanceStatus === "Absent" ? (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30">
                        Absent
                      </span>
                    ) : null}
                  </div>

                  {/* Reg No & Team Details */}
                  <div className="flex items-center gap-3 text-xs text-white/60 mt-1 flex-wrap">
                    <span className="font-mono bg-white/5 px-2 py-0.5 rounded text-white/90 font-medium border border-white/10">
                      {p.regNo}
                    </span>
                    <span className="text-white/40">•</span>
                    <span className="text-orange-400 font-semibold font-mono">[{p.teamCode}]</span>
                    <span className="text-white/80 font-medium truncate max-w-[200px]">
                      {p.teamName}
                    </span>
                    {p.phone && p.phone !== "—" && (
                      <>
                        <span className="text-white/40 hidden sm:inline">•</span>
                        <span className="text-white/50 hidden sm:inline">📞 {p.phone}</span>
                      </>
                    )}
                  </div>

                  {/* All Meals Mini Status Pills */}
                  <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-white/40 mr-1">
                      All Meals:
                    </span>
                    {allMealTypes.map((m) => {
                      const hasMeal = !!p.meals[m.key];
                      return (
                        <button
                          key={m.key}
                          type="button"
                          onClick={() => handleToggleMeal(p, m.key)}
                          className={`text-[11px] px-2 py-0.5 rounded-md border flex items-center gap-1 font-medium transition-all ${
                            hasMeal
                              ? "bg-green-500/20 border-green-500/40 text-green-300 hover:bg-green-500/30"
                              : "bg-white/5 border-white/10 text-white/40 hover:text-white/70 hover:border-white/20"
                          }`}
                          title={`Click to toggle ${m.label}`}
                        >
                          <span>{hasMeal ? "✓" : "○"}</span>
                          <span>{m.label.replace(/^Day \d+ –? ?/, "")}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Primary 1-Click Action Button for Active Meal */}
                <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
                  {p.updatedBy && (
                    <span className="text-[11px] text-white/40 hidden lg:inline text-right">
                      Updated by {p.updatedBy}
                    </span>
                  )}

                  <button
                    type="button"
                    disabled={isUpdating}
                    onClick={() => handleToggleMeal(p, activeMealKey)}
                    className={`btn !py-2.5 !px-5 !text-sm font-bold flex items-center gap-2 rounded-xl transition-all shadow-sm ${
                      isServedActive
                        ? "!bg-green-500 text-black hover:!bg-green-400 shadow-green-500/20"
                        : "!bg-white/10 text-white border border-white/20 hover:!bg-white/20 hover:border-white/30"
                    }`}
                  >
                    <span>{isServedActive ? "✓" : "○"}</span>
                    <span>
                      {isServedActive
                        ? `${activeMeal.label.replace(/^Day \d+ –? ?/, "")} Served`
                        : `Mark ${activeMeal.label.replace(/^Day \d+ –? ?/, "")}`}
                    </span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
