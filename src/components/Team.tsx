"use client";
import Link from "next/link";
import { useEffect, useState, useMemo } from "react";
import { api, Team, today } from "@/lib/api";
import { ErrorBox, Skeleton, useLoad } from "./ui";

interface TeamAttendanceStat {
  teamId: string;
  present: number;
  absent: number;
  totalMembers: number;
}

export function TeamCard({
  t,
  stat,
}: {
  t: Team & { isShortlisted?: boolean; isStaged?: boolean; submissionUrl?: string; problemStatement?: string };
  stat?: TeamAttendanceStat;
}) {
  const memberCount = t.memberCount ?? t.members?.length ?? 0;
  const hasAttendance = stat !== undefined;
  const isZeroPresent = hasAttendance && stat!.present === 0 && (stat!.absent > 0 || memberCount > 0);
  const absentCount = stat?.absent ?? 0;
  const notMarked = hasAttendance ? Math.max(0, memberCount - stat!.present - stat!.absent) : 0;

  return (
    <div
      className={`card p-5 border transition-all flex flex-col justify-between gap-3 ${
        isZeroPresent
          ? "border-red-500/60 bg-red-950/20 shadow-lg shadow-red-500/10"
          : "border-white/10 hover:border-orange-500/50"
      }`}
    >
      <div>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-orange-500/15 text-orange-400 font-semibold">
            {t.teamId}
          </span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {(t as any).isShortlisted && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-medium border border-purple-500/30">
                🏆 Shortlisted
              </span>
            )}
            {(t as any).isStaged && !(t as any).isShortlisted && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-medium border border-blue-500/30">
                🎯 Staged
              </span>
            )}
            <span className="text-xs text-white/50">{memberCount} Members</span>
          </div>
        </div>
        <h3 className="text-lg font-bold uppercase mt-2 text-white">{t.name}</h3>
        {(t as any).problemStatement && (
          <p className="text-xs text-white/40 mt-1 line-clamp-2">{(t as any).problemStatement}</p>
        )}

        {/* Attendance mini-stats */}
        {hasAttendance && (
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {isZeroPresent && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30 font-semibold animate-pulse">
                🚨 0 present
              </span>
            )}
            {stat!.present > 0 && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/25">
                ✓ {stat!.present} present
              </span>
            )}
            {absentCount > 0 && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/25">
                ✗ {absentCount} absent
              </span>
            )}
            {notMarked > 0 && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-white/5 text-white/40 border border-white/10">
                ○ {notMarked} unmarked
              </span>
            )}
          </div>
        )}
      </div>
      <Link
        href={`/teams/${encodeURIComponent(t.teamId)}`}
        className="btn !bg-orange-500 hover:!bg-orange-600 mt-2 text-center text-sm font-semibold"
      >
        Mark / View Attendance →
      </Link>
    </div>
  );
}

export function TeamSearch({ onResults }: { onResults?: (n: number) => void }) {
  const [v, setV] = useState("");
  const [s, setS] = useState("");
  const todayDate = today();

  useEffect(() => {
    const h = setTimeout(() => setS(v.trim()), 200);
    return () => clearTimeout(h);
  }, [v]);

  const { data, error, loading, reload } = useLoad(() => api.teams(s), [s]);
  const { data: statsData } = useLoad(() => api.stats(todayDate), [todayDate]);

  useEffect(() => {
    if (onResults && data) onResults(data.length);
  }, [data, onResults]);

  // Build a quick lookup map from teamId -> stats
  const statMap = useMemo<Map<string, TeamAttendanceStat>>(() => {
    const m = new Map<string, TeamAttendanceStat>();
    if (statsData && (statsData as any).teams) {
      for (const ts of (statsData as any).teams) {
        m.set(ts.teamId, ts);
      }
    }
    return m;
  }, [statsData]);

  return (
    <div className="space-y-4">
      <input
        className="input !py-3.5 !text-base bg-white/5 border-white/10 focus:border-orange-500"
        aria-label="Search teams"
        placeholder="Search by team name or team code..."
        value={v}
        onChange={(e) => setV(e.target.value)}
      />

      {loading ? (
        <Skeleton rows={3} />
      ) : error ? (
        <ErrorBox msg={error} retry={reload} />
      ) : !data?.length ? (
        <div className="card p-10 text-center space-y-4 border border-white/10 bg-white/[0.02]">
          <div className="text-4xl">🔍</div>
          <div>
            <h3 className="text-lg font-semibold text-white">No Eligible Teams Found</h3>
            <p className="text-sm text-white/50 mt-1 max-w-md mx-auto">
              Only teams that have been <strong className="text-blue-300">staged</strong> or{" "}
              <strong className="text-purple-300">shortlisted</strong> in the IG portal appear here.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map((t) => (
            <TeamCard key={t.teamId} t={t} stat={statMap.get(t.teamId)} />
          ))}
        </div>
      )}
    </div>
  );
}
