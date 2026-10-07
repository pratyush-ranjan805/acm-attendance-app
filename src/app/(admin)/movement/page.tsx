"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { api, ParticipantMovement, MovementSummary, MovementHistory, MovementReason } from "@/lib/api";
import { Skeleton, useToast } from "@/components/ui";

const REASONS: { key: MovementReason; label: string; icon: string; color: string }[] = [
  { key: "Food", label: "Food / Refreshment", icon: "🍔", color: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
  { key: "Restroom", label: "Restroom", icon: "🚻", color: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  { key: "Exam", label: "Exam / Academics", icon: "📝", color: "bg-purple-500/20 text-purple-300 border-purple-500/30" },
  { key: "Personal", label: "Personal Emergency", icon: "👤", color: "bg-pink-500/20 text-pink-300 border-pink-500/30" },
  { key: "Other", label: "Other", icon: "💬", color: "bg-neutral-700/60 text-white/80 border-white/20" },
];

export default function RoomMovementPage() {
  const [data, setData] = useState<MovementSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "out" | "in" | "history">("all");
  const [history, setHistory] = useState<MovementHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Modal State
  const [selectedParticipant, setSelectedParticipant] = useState<ParticipantMovement | null>(null);
  const [selectedReason, setSelectedReason] = useState<MovementReason>("Food");
  const [customReason, setCustomReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const toast = useToast();

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const res = await api.movement();
      setData(res);
    } catch (e) {
      setError((e as Error).message || "Failed to load movement data");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await api.movementHistory(150);
      setHistory(res);
    } catch (e) {
      toast((e as Error).message, false);
    } finally {
      setLoadingHistory(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
    // Auto-refresh counters and movement state every 30 seconds
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  useEffect(() => {
    if (activeTab === "history") {
      loadHistory();
    }
  }, [activeTab, loadHistory]);

  // Handle Mark OUT
  const handleMarkOut = async () => {
    if (!selectedParticipant) return;
    setSubmitting(true);
    try {
      await api.markOut({
        profileId: selectedParticipant.id,
        reason: selectedReason,
        customReason: selectedReason === "Other" ? customReason : customReason.trim() || undefined,
      });
      toast(`Marked ${selectedParticipant.name} OUT for ${selectedReason}`);
      setSelectedParticipant(null);
      setCustomReason("");
      setSelectedReason("Food");
      await loadData();
    } catch (e) {
      toast((e as Error).message, false);
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Mark IN (Return)
  const handleMarkIn = async (participant: ParticipantMovement) => {
    try {
      await api.markIn(participant.id);
      toast(`Marked ${participant.name} back IN the room`);
      await loadData();
    } catch (e) {
      toast((e as Error).message, false);
    }
  };

  // Handle Export
  const handleExport = async () => {
    setExporting(true);
    try {
      await api.exportMovementXlsx();
      toast("Room movement report exported successfully!");
    } catch (e) {
      toast((e as Error).message, false);
    } finally {
      setExporting(false);
    }
  };

  // Filter participants
  const filteredParticipants = useMemo(() => {
    if (!data) return [];
    let list = data.participants;

    if (activeTab === "out") {
      list = list.filter((p) => p.isOut);
    } else if (activeTab === "in") {
      list = list.filter((p) => !p.isOut);
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.registrationNumber.toLowerCase().includes(q) ||
          p.phoneNumber.toLowerCase().includes(q) ||
          p.teamName.toLowerCase().includes(q) ||
          p.teamCode.toLowerCase().includes(q)
      );
    }

    return list;
  }, [data, activeTab, search]);

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <span>🚪</span> Room Movement Tracker
          </h1>
          <p className="text-sm text-white/60 mt-0.5">
            Real-time tracking of participants entering and exiting the room
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            className="btn-ghost !text-white/70 hover:!text-white border border-white/10 text-xs px-3 py-1.5"
            title="Refresh list"
          >
            🔄 Refresh
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="btn !bg-orange-600 hover:!bg-orange-500 flex items-center gap-1.5 text-xs px-3 py-1.5 font-medium"
          >
            {exporting ? "Exporting..." : "📥 Export Movement Report"}
          </button>
        </div>
      </div>

      {/* Stats Overview */}
      {data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="card p-4 border border-white/10 bg-white/[0.02]">
            <p className="text-xs uppercase tracking-wider text-white/50">Total Participants</p>
            <p className="text-2xl font-bold text-white mt-1">{data.totalParticipants}</p>
            <p className="text-[11px] text-white/40 mt-0.5">Eligible teams</p>
          </div>

          <div className="card p-4 border border-green-500/20 bg-green-500/[0.03]">
            <p className="text-xs uppercase tracking-wider text-green-400">Inside Room</p>
            <p className="text-2xl font-bold text-green-400 mt-1">{data.insideCount}</p>
            <p className="text-[11px] text-green-400/60 mt-0.5">Present in venue</p>
          </div>

          <div className="card p-4 border border-amber-500/30 bg-amber-500/[0.05]">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wider text-amber-400 font-semibold">Currently OUT</p>
              {data.outCount > 0 && (
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                </span>
              )}
            </div>
            <p className="text-2xl font-bold text-amber-400 mt-1">{data.outCount}</p>
            <p className="text-[11px] text-amber-400/70 mt-0.5">Away from room</p>
          </div>

          <div className="card p-4 border border-white/10 bg-white/[0.02]">
            <p className="text-xs uppercase tracking-wider text-white/50">Movements Today</p>
            <p className="text-2xl font-bold text-white mt-1">{data.totalMovementsToday}</p>
            <p className="text-[11px] text-white/40 mt-0.5">Outpass logs logged</p>
          </div>
        </div>
      )}

      {/* Tabs & Search Navigation */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
          {/* Tabs */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setActiveTab("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeTab === "all"
                  ? "bg-white/15 text-white shadow-sm"
                  : "text-white/60 hover:text-white hover:bg-white/5"
              }`}
            >
              All Participants ({data?.totalParticipants ?? 0})
            </button>
            <button
              onClick={() => setActiveTab("out")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                activeTab === "out"
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                  : "text-amber-400/80 hover:text-amber-300 hover:bg-amber-500/10"
              }`}
            >
              <span>Currently OUT</span>
              {data && data.outCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-black text-[10px] font-bold">
                  {data.outCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("in")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeTab === "in"
                  ? "bg-green-500/20 text-green-300 border border-green-500/30"
                  : "text-green-400/80 hover:text-green-300 hover:bg-green-500/10"
              }`}
            >
              Inside Room ({data?.insideCount ?? 0})
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeTab === "history"
                  ? "bg-white/15 text-white shadow-sm"
                  : "text-white/60 hover:text-white hover:bg-white/5"
              }`}
            >
              📜 History Log
            </button>
          </div>

          {/* Search bar */}
          {activeTab !== "history" && (
            <div className="relative min-w-[260px] flex-1 sm:flex-initial">
              <input
                type="text"
                placeholder="Search name, reg no, phone, team..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input !text-xs !py-1.5 !pl-8 !pr-7 w-full bg-neutral-900 border-white/15"
              />
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40 text-xs">🔍</span>
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <Skeleton rows={6} />
      ) : error ? (
        <div className="card p-6 border border-red-500/20 bg-red-500/10 text-center">
          <p className="text-red-300 font-medium">{error}</p>
          <button onClick={loadData} className="btn mt-3 !text-xs">
            Retry
          </button>
        </div>
      ) : activeTab === "history" ? (
        /* History Log View */
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white/80">Movement History Records</h2>
            <button
              onClick={loadHistory}
              disabled={loadingHistory}
              className="text-xs text-orange-400 hover:underline"
            >
              {loadingHistory ? "Refreshing..." : "Refresh Log"}
            </button>
          </div>

          {loadingHistory ? (
            <Skeleton rows={5} />
          ) : history.length === 0 ? (
            <div className="card p-8 text-center text-white/50">No movement history records logged yet.</div>
          ) : (
            <div className="card overflow-x-auto border border-white/10">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-white/10 bg-white/[0.02] text-white/60">
                  <tr>
                    <th className="p-3">Participant</th>
                    <th className="p-3">Reg No / Phone</th>
                    <th className="p-3">Team</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Reason</th>
                    <th className="p-3">Out Time</th>
                    <th className="p-3">In Time</th>
                    <th className="p-3">Duration</th>
                    <th className="p-3">Marked By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {history.map((h) => (
                    <tr key={h.id} className="hover:bg-white/[0.02]">
                      <td className="p-3 font-medium text-white">{h.participantName}</td>
                      <td className="p-3 font-mono text-white/70">
                        {h.registrationNumber}
                        <br />
                        <span className="text-white/40 text-[11px]">{h.phoneNumber}</span>
                      </td>
                      <td className="p-3">
                        <span className="font-semibold text-orange-400">{h.teamCode}</span>
                        <br />
                        <span className="text-white/50 text-[11px]">{h.teamName}</span>
                      </td>
                      <td className="p-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            h.status === "OUT"
                              ? "bg-red-500/20 text-red-300 border border-red-500/30"
                              : "bg-green-500/20 text-green-300 border border-green-500/30"
                          }`}
                        >
                          {h.status === "OUT" ? "🔴 OUT" : "🟢 RETURNED"}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="font-medium text-white/90">{h.reason}</span>
                        {h.customReason && (
                          <p className="text-[11px] text-white/50 italic mt-0.5">{h.customReason}</p>
                        )}
                      </td>
                      <td className="p-3 text-white/70">
                        {h.outTime ? new Date(h.outTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                      </td>
                      <td className="p-3 text-white/70">
                        {h.inTime ? (
                          new Date(h.inTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                        ) : (
                          <span className="text-amber-400 font-medium">Still OUT</span>
                        )}
                      </td>
                      <td className="p-3 font-mono text-white/80">{h.durationMinutes}m</td>
                      <td className="p-3 text-white/50">{h.markedBy || "Admin"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* Participants List View */
        <div className="space-y-3">
          {filteredParticipants.length === 0 ? (
            <div className="card p-10 text-center text-white/50 border border-white/10">
              <p className="text-lg">No participants found</p>
              <p className="text-xs text-white/40 mt-1">
                {search ? "Try adjusting your search criteria" : "No participants match the selected filter"}
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredParticipants.map((p) => {
                const active = p.activeMovement;
                return (
                  <div
                    key={p.id}
                    className={`card p-4 border transition-all duration-200 flex flex-col justify-between ${
                      p.isOut
                        ? "border-amber-500/40 bg-amber-500/[0.04] shadow-lg shadow-amber-500/5"
                        : "border-white/10 bg-neutral-900/60 hover:border-white/20"
                    }`}
                  >
                    <div>
                      {/* Top Row: Team badge & Status */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/30">
                            {p.teamCode}
                          </span>
                          <span className="text-xs text-white/50 truncate max-w-[140px]" title={p.teamName}>
                            {p.teamName}
                          </span>
                        </div>

                        {p.isOut ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
                            🔴 OUT
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-500/20 text-green-300 border border-green-500/30">
                            🟢 IN ROOM
                          </span>
                        )}
                      </div>

                      {/* Participant Name & Role */}
                      <div className="mb-2">
                        <h3 className="font-bold text-white text-base leading-tight flex items-center gap-1.5">
                          {p.name}
                          {p.role === "Leader" && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-yellow-500/20 text-yellow-300 font-semibold border border-yellow-500/30">
                              Leader
                            </span>
                          )}
                        </h3>
                        {p.department && <p className="text-[11px] text-white/40">{p.department}</p>}
                      </div>

                      {/* Details: Reg No & Phone */}
                      <div className="space-y-1 text-xs border-t border-white/5 pt-2 mb-3">
                        <div className="flex items-center justify-between text-white/60">
                          <span>Reg No:</span>
                          <span className="font-mono font-medium text-white/90">{p.registrationNumber}</span>
                        </div>

                        <div className="flex items-center justify-between text-white/60">
                          <span>Phone:</span>
                          {p.phoneNumber && p.phoneNumber !== "—" ? (
                            <a
                              href={`tel:${p.phoneNumber}`}
                              className="font-mono text-blue-400 hover:underline flex items-center gap-1"
                            >
                              <span>📞</span> {p.phoneNumber}
                            </a>
                          ) : (
                            <span className="text-white/40">—</span>
                          )}
                        </div>
                      </div>

                      {/* Active OUT info badge */}
                      {p.isOut && active && (
                        <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-2.5 mb-3 text-xs space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-amber-300 font-semibold flex items-center gap-1">
                              <span>Reason:</span> {active.reason}
                            </span>
                            <span className="text-amber-400 font-mono text-[11px] font-bold">
                              ⏱️ {active.minutesOut}m ago
                            </span>
                          </div>
                          {active.customReason && (
                            <p className="text-[11px] text-white/70 italic">&quot;{active.customReason}&quot;</p>
                          )}
                          <p className="text-[10px] text-white/40">
                            Left at{" "}
                            {new Date(active.outTime).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Bottom Action Button */}
                    <div className="pt-2 border-t border-white/5">
                      {p.isOut ? (
                        <button
                          onClick={() => handleMarkIn(p)}
                          className="w-full py-2 rounded-lg text-xs font-bold bg-green-600 hover:bg-green-500 text-white flex items-center justify-center gap-1.5 transition-all shadow-md shadow-green-900/20"
                        >
                          <span>✓</span> Mark Returned / IN
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setSelectedParticipant(p);
                            setSelectedReason("Food");
                            setCustomReason("");
                          }}
                          className="w-full py-2 rounded-lg text-xs font-bold bg-neutral-800 hover:bg-neutral-700 text-white/90 hover:text-white border border-white/10 flex items-center justify-center gap-1.5 transition-all hover:border-amber-500/40"
                        >
                          <span>🚪</span> Mark OUT
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* MARK OUT MODAL */}
      {selectedParticipant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="card w-full max-w-md p-5 border border-white/15 bg-neutral-950 shadow-2xl space-y-4">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-white/10 pb-3">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <span>🚪</span> Mark Participant OUT
                </h2>
                <p className="text-xs text-white/60 mt-0.5">Select reason for leaving the room</p>
              </div>
              <button
                onClick={() => setSelectedParticipant(null)}
                className="text-white/40 hover:text-white text-lg p-1"
              >
                ✕
              </button>
            </div>

            {/* Participant Summary */}
            <div className="rounded-lg bg-white/[0.03] border border-white/10 p-3 text-xs space-y-1">
              <p className="font-bold text-white text-sm">{selectedParticipant.name}</p>
              <div className="flex items-center gap-3 text-white/60">
                <span>
                  Reg: <span className="font-mono text-white/90">{selectedParticipant.registrationNumber}</span>
                </span>
                <span>
                  Team: <span className="font-mono text-orange-400">{selectedParticipant.teamCode}</span>
                </span>
              </div>
              {selectedParticipant.phoneNumber && (
                <p className="text-white/60">
                  Phone: <span className="font-mono text-white/90">{selectedParticipant.phoneNumber}</span>
                </p>
              )}
            </div>

            {/* Reason Selection */}
            <div>
              <label className="block text-xs font-medium text-white/70 mb-2">
                Select Reason <span className="text-red-400">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {REASONS.map((r) => {
                  const isSelected = selectedReason === r.key;
                  return (
                    <button
                      key={r.key}
                      type="button"
                      onClick={() => setSelectedReason(r.key)}
                      className={`p-2.5 rounded-lg border text-xs font-semibold flex items-center gap-2 transition-all ${
                        isSelected
                          ? "border-orange-500 bg-orange-500/20 text-orange-300 shadow-sm"
                          : "border-white/10 bg-neutral-900 text-white/70 hover:border-white/20 hover:text-white"
                      }`}
                    >
                      <span className="text-base">{r.icon}</span>
                      <span>{r.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Note / Custom Reason */}
            <div>
              <label className="block text-xs font-medium text-white/70 mb-1">
                {selectedReason === "Other" ? "Specify Reason / Note *" : "Optional Note"}
              </label>
              <input
                type="text"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder={
                  selectedReason === "Other"
                    ? "e.g. Meeting faculty, hardware lab..."
                    : "e.g. Heading to cafeteria..."
                }
                className="input text-xs w-full"
              />
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setSelectedParticipant(null)}
                className="btn-ghost text-xs"
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleMarkOut}
                disabled={submitting || (selectedReason === "Other" && !customReason.trim())}
                className="btn !bg-orange-600 hover:!bg-orange-500 text-xs font-bold px-4"
              >
                {submitting ? "Marking..." : "Confirm OUT"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
