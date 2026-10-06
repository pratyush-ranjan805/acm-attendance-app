"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, Team } from "@/lib/api";
import { ErrorBox, Skeleton, useLoad } from "./ui";
import { RegisterTeamModal } from "./RegisterTeamModal";
import { ImportModal } from "./ImportModal";

export function TeamCard({ t }: { t: Team }) {
  return (
    <div className="card p-5 border border-white/10 hover:border-orange-500/50 transition-all flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-orange-500/15 text-orange-400 font-semibold">
            {t.teamId}
          </span>
          <span className="text-xs text-white/50">
            {t.memberCount ?? t.members?.length ?? 0} Members
          </span>
        </div>
        <h3 className="text-lg font-bold uppercase mt-2 text-white">{t.name}</h3>
      </div>
      <Link
        href={`/teams/${encodeURIComponent(t.teamId)}`}
        className="btn !bg-orange-500 hover:!bg-orange-600 mt-4 text-center text-sm font-semibold"
      >
        Mark / View Attendance →
      </Link>
    </div>
  );
}

export function TeamSearch({ onResults }: { onResults?: (n: number) => void }) {
  const [v, setV] = useState("");
  const [s, setS] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    const h = setTimeout(() => setS(v.trim()), 200);
    return () => clearTimeout(h);
  }, [v]);

  const { data, error, loading, reload } = useLoad(() => api.teams(s), [s]);

  return (
    <div className="space-y-4">
      <input
        className="input !py-3.5 !text-base bg-white/5 border-white/10 focus:border-orange-500"
        aria-label="Search teams"
        placeholder="Search team name or team ID (e.g. ACM001)..."
        value={v}
        onChange={(e) => setV(e.target.value)}
      />

      {loading ? (
        <Skeleton rows={3} />
      ) : error ? (
        <ErrorBox msg={error} retry={reload} />
      ) : !data?.length ? (
        <div className="card p-10 text-center space-y-4 border border-white/10 bg-white/[0.02]">
          <div className="text-4xl">👥</div>
          <div>
            <h3 className="text-lg font-semibold text-white">No Teams Registered Yet</h3>
            <p className="text-sm text-white/50 mt-1 max-w-md mx-auto">
              Get started by uploading your hackathon roster spreadsheet or register your first team manually.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              onClick={() => setManualOpen(true)}
              className="btn !bg-neutral-800 hover:!bg-neutral-700 border border-white/10 text-sm"
            >
              ✏️ Register Team Manually
            </button>
            <button
              onClick={() => setImportOpen(true)}
              className="btn !bg-orange-600 hover:!bg-orange-700 text-sm"
            >
              📤 Upload Excel / PDF Roster
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map((t) => (
            <TeamCard key={t.teamId} t={t} />
          ))}
        </div>
      )}

      <RegisterTeamModal
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        onSuccess={() => reload()}
      />

      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onSuccess={() => reload()}
      />
    </div>
  );
}
