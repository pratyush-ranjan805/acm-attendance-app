"use client";
import { useMemo, useState } from "react"; import { api, fmtTime, Rec } from "@/lib/api"; import { Empty, ErrorBox, Skeleton, useLoad } from "@/components/ui"; import { ExportButton } from "@/components/Shell";
const COLS: [keyof Rec, string][] = [["date", "Date"], ["teamName", "Team"], ["teamId", "Team ID"], ["memberName", "Member"], ["role", "Role"], ["status", "Status"], ["markedAt", "Marked Time"]];
export default function History() {
  const [date, setDate] = useState(""); const [team, setTeam] = useState(""); const [status, setStatus] = useState(""); const [sort, setSort] = useState<[keyof Rec, 1 | -1]>(["date", -1]);
  const { data, error, loading, reload } = useLoad(() => api.attendance({ date, teamId: team.trim(), status }), [date, team, status]);
  const rows = useMemo(() => [...(data ?? [])].sort((a, b) => String(a[sort[0]] ?? "").localeCompare(String(b[sort[0]] ?? "")) * sort[1]), [data, sort]);
  return <div className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold">Attendance History</h1><ExportButton date={date || undefined} label="Export Excel" /></div>
    <div className="card grid gap-3 p-4 md:grid-cols-3"><input type="date" aria-label="Date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
      <input className="input" aria-label="Team ID" placeholder="Team ID (e.g. ACM001)" value={team} onChange={(e) => setTeam(e.target.value)} />
      <select aria-label="Status" className="input" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option><option>Present</option><option>Absent</option></select></div>
    {loading ? <Skeleton /> : error ? <ErrorBox msg={error} retry={reload} /> : !rows.length ? <Empty msg="No attendance records found" /> :
      <div className="card overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-white/10 text-white/60"><tr>{COLS.map(([k, l]) =>
        <th key={k} className="p-3"><button onClick={() => setSort([k, sort[0] === k ? (-sort[1] as 1 | -1) : 1])}>{l}{sort[0] === k ? (sort[1] === 1 ? " ▲" : " ▼") : ""}</button></th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-white/5"><td className="p-3">{r.date}</td><td className="p-3">{r.teamName}</td><td className="p-3">{r.teamId}</td><td className="p-3">{r.memberName}</td><td className="p-3">{r.role}</td>
          <td className={`p-3 font-semibold ${r.status === "Present" ? "text-green-400" : "text-red-400"}`}>{r.status}</td><td className="p-3">{fmtTime(r.markedAt)}</td></tr>)}</tbody></table></div>}</div>;
}
