"use client";
import { useState } from "react"; import { api, today } from "@/lib/api"; import { DateSelector, Empty, ErrorBox, Skeleton, Stat, useLoad } from "@/components/ui"; import { ExportButton } from "@/components/Shell";
export default function Reports() {
  const [date, setDate] = useState(today());
  const { data, error, loading, reload } = useLoad(() => api.attendance({ date }), [date]);
  const by = new Map<string, { name: string; p: number; a: number }>();
  (data ?? []).forEach((r) => { const x = by.get(r.teamId) ?? { name: r.teamName, p: 0, a: 0 }; r.status === "Present" ? x.p++ : x.a++; by.set(r.teamId, x); });
  const teams = [...by.values()]; const P = teams.reduce((s, t) => s + t.p, 0), A = teams.reduce((s, t) => s + t.a, 0); const pct = (p: number, a: number) => (p + a ? (p / (p + a)) * 100 : 0);
  return <div className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold">Reports</h1>
    <div className="flex gap-2"><ExportButton date={date} label="Export Today's Attendance" /><ExportButton label="Export All Attendance" /></div></div>
    <DateSelector value={date} onChange={setDate} />
    {loading ? <Skeleton /> : error ? <ErrorBox msg={error} retry={reload} /> : !teams.length ? <Empty msg="No attendance records found" /> : <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5"><Stat label="Total teams" value={teams.length} /><Stat label="Total members" value={P + A} /><Stat label="Total present" value={P} /><Stat label="Total absent" value={A} /><Stat label="Attendance" value={`${pct(P, A).toFixed(2)}%`} /></div>
      <div className="card space-y-3 p-4"><h2 className="font-semibold">Attendance overview</h2>{teams.map((t) => <div key={t.name}><div className="mb-1 flex justify-between text-sm"><span>{t.name}</span><span className="text-white/60">{t.p + t.a} Members · {t.p} Present · {t.a} Absent · {pct(t.p, t.a).toFixed(0)}%</span></div>
        <div className="h-2.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={Math.round(pct(t.p, t.a))} aria-label={`${t.name} attendance`}><div className="h-full bg-acm" style={{ width: `${pct(t.p, t.a)}%` }} /></div></div>)}</div></>}</div>;
}
