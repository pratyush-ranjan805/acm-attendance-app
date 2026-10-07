"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, Team } from "@/lib/api";
import { ErrorBox, Skeleton, useLoad } from "./ui";

export function TeamCard({ t }: { t: Team & { isShortlisted?: boolean; isStaged?: boolean; submissionUrl?: string; problemStatement?: string } }) {
  return (
    <div className="card p-5 border border-white/10 hover:border-orange-500/50 transition-all flex flex-col justify-between gap-3">
      <div>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-orange-500/15 text-orange-400 font-semibold">
            {t.teamId}
          </span>
          <div className="flex items-center gap-1.5">
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
            <span className="text-xs text-white/50">
              {t.memberCount ?? t.members?.length ?? 0} Members
            </span>
          </div>
        </div>
        <h3 className="text-lg font-bold uppercase mt-2 text-white">{t.name}</h3>
        {(t as any).problemStatement && (
          <p className="text-xs text-white/40 mt-1 line-clamp-2">{(t as any).problemStatement}</p>
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

  useEffect(() => {
    const h = setTimeout(() => setS(v.trim()), 200);
    return () => clearTimeout(h);
  }, [v]);

  const { data, error, loading, reload } = useLoad(() => api.teams(s), [s]);

  useEffect(() => {
    if (onResults && data) onResults(data.length);
  }, [data, onResults]);

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
            <TeamCard key={t.teamId} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}
