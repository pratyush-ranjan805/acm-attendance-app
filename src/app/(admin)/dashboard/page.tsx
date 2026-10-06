"use client";
import { useState } from "react";
import { api, today, fmtDate } from "@/lib/api";
import { ErrorBox, Skeleton, Stat, useLoad } from "@/components/ui";
import { TeamSearch } from "@/components/Team";
import { ExportButton } from "@/components/Shell";
import { ImportModal } from "@/components/ImportModal";
import { RegisterTeamModal } from "@/components/RegisterTeamModal";

export default function Dashboard() {
  const d = today();
  const [manualOpen, setManualOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [k, setK] = useState(0);
  const { data, error, loading, reload } = useLoad(() => api.stats(d), [d, k]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">ACM SIGGRAPH Hackathon Attendance</h1>
          <p className="text-white/60">
            Manage team attendance and event participation · {fmtDate(d)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setManualOpen(true)}
            className="btn !bg-neutral-800 hover:!bg-neutral-700 border border-white/10 flex items-center gap-1.5 text-sm"
          >
            ✏️ Register Team
          </button>
          <button
            onClick={() => setImportOpen(true)}
            className="btn !bg-orange-600 hover:!bg-orange-700 flex items-center gap-1.5 text-sm"
          >
            📤 Upload Excel / PDF
          </button>
          <ExportButton date={d} label="Export Attendance" />
        </div>
      </div>

      {loading ? (
        <Skeleton rows={1} />
      ) : error ? (
        <ErrorBox msg={error} retry={reload} />
      ) : (
        data && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label="Total Teams" value={data.totalTeams} />
            <Stat label="Total Members" value={data.totalMembers} />
            <Stat label="Present Today" value={data.present} />
            <Stat label="Absent Today" value={data.absent} />
            <Stat
              label="Attendance"
              value={`${data.percentage.toFixed(2)}%`}
            />
          </div>
        )
      )}

      <TeamSearch key={k} />

      <RegisterTeamModal
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        onSuccess={() => {
          reload();
          setK((prev) => prev + 1);
        }}
      />

      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onSuccess={() => {
          reload();
          setK((prev) => prev + 1);
        }}
      />
    </div>
  );
}
