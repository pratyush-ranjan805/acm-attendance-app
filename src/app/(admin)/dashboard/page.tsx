"use client";
import { useState } from "react";
import { api, today, fmtDate } from "@/lib/api";
import { ErrorBox, Skeleton, Stat, useLoad } from "@/components/ui";
import { TeamSearch } from "@/components/Team";
import { ExportButton } from "@/components/Shell";

export default function Dashboard() {
  const d = today();
  const [k] = useState(0);
  const { data, error, loading, reload } = useLoad(() => api.stats(d), [d, k]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">ACM SIGGRAPH Hackathon Attendance</h1>
          <p className="text-white/60">
            Manage team attendance and event participation · {fmtDate(d)}
          </p>
          <p className="text-xs text-white/40 mt-0.5">
            Showing staged &amp; shortlisted teams from the IG portal
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
    </div>
  );
}
