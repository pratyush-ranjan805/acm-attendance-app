"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, Status, today, fmtDate } from "@/lib/api";
import { ConfirmDialog, DateSelector, ErrorBox, Skeleton, useLoad, useToast } from "@/components/ui";
import { SwipeableMemberRow } from "@/components/SwipeableMemberRow";

export default function TeamDetails() {
  const id = decodeURIComponent(useParams<{ id: string }>().id);
  const toast = useToast();
  const [date, setDate] = useState(today());
  const [marks, setMarks] = useState<Record<string, Status>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);

  const { data: t, error, loading, reload, setData } = useLoad(() => api.team(id, date), [id, date]);

  useEffect(() => {
    if (t) {
      setMarks(Object.fromEntries(t.members.map((m) => [m.id, m.status ?? "Absent"])));
      setDirty(false);
    }
  }, [t]);

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const changeDate = (d: string) => {
    if (dirty && !confirm("Discard unsaved attendance changes?")) return;
    setDate(d);
  };

  const present = Object.values(marks).filter((s) => s === "Present").length;

  async function save() {
    if (!t) return;
    setSaving(true);
    try {
      const res = await api.saveAttendance({
        teamId: id,
        date,
        records: t.members.map((m) => ({ memberId: m.id, status: marks[m.id] })),
      });
      toast("Attendance saved successfully");
      setDirty(false);
      setData((prev: any) => {
        if (!prev) return prev;
        return {
          ...prev,
          members: prev.members.map((m: any) => ({
            ...m,
            status: marks[m.id] ?? m.status,
            markedAt: res.markedAt || new Date().toISOString(),
            updatedBy: "You",
          })),
        };
      });
    } catch (e) {
      toast(`Not saved: ${(e as Error).message}`, false);
    }
    setSaving(false);
  }

  if (loading) return <Skeleton rows={4} />;
  if (error || !t) return <ErrorBox msg={error ?? "Team not found"} retry={reload} />;

  const igData = t as any;

  // Show who last marked attendance (from any member's markedAt)
  const lastMarked = t.members
    .filter((m) => m.markedAt)
    .sort((a, b) => ((b.markedAt ?? "") > (a.markedAt ?? "") ? 1 : -1))[0];

  return (
    <div className="space-y-5 pb-24">
      <Link href="/teams" className="text-sm text-orange-400 hover:underline">
        ← Back to Teams
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {igData.isShortlisted && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                🏆 Shortlisted
              </span>
            )}
            {igData.isStaged && !igData.isShortlisted && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                🎯 Staged
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold uppercase text-white">{t.name}</h1>
          <p className="text-white/60">
            Team Code: <span className="font-mono text-orange-400 font-semibold">{t.teamId}</span> ·{" "}
            {t.members.length} members
          </p>
          {igData.problemStatement && (
            <p className="text-xs text-white/40 mt-1 max-w-lg">{igData.problemStatement}</p>
          )}
          {igData.submissionUrl && (
            <a
              href={igData.submissionUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-orange-400 hover:underline mt-1 inline-block"
            >
              View Submission →
            </a>
          )}
        </div>
      </div>

      <DateSelector value={date} onChange={changeDate} />

      <div className="card p-4 border border-white/10 flex items-center justify-between">
        <div>
          <p className="text-xs text-white/60">Attendance for {fmtDate(date)}</p>
          <p className="text-3xl font-bold text-orange-400 mt-0.5">
            {present} / {t.members.length} Present
          </p>
          {lastMarked && (
            <p className="text-xs text-white/40 mt-1">
              Last updated{lastMarked.markedAt
                ? ` at ${new Date(lastMarked.markedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`
                : ""}
              {(lastMarked as any).updatedBy ? ` by ${(lastMarked as any).updatedBy}` : ""}
            </p>
          )}
        </div>
        <div className="text-xs text-white/40 text-right hidden sm:block">
          Swipe right → Present<br />
          ← Swipe left for Absent
        </div>
      </div>

      {/* Member Info Cards */}
      <div className="card p-4 border border-white/10 bg-white/[0.01]">
        <p className="text-xs text-white/40 mb-3 font-medium uppercase tracking-wider">Team Members</p>
        <div className="space-y-2">
          {t.members.length === 0 && (
            <div className="text-center text-white/40 py-6">No members found for this team.</div>
          )}
          {t.members.map((m) => (
            <SwipeableMemberRow
              key={m.id}
              member={m}
              status={marks[m.id] ?? "Absent"}
              onStatusChange={(newStatus) => {
                setMarks((prev) => ({ ...prev, [m.id]: newStatus }));
                setDirty(true);
              }}
              onEdit={undefined}
              onDelete={undefined}
            />
          ))}
        </div>
      </div>

      {/* Bottom Sticky Save Bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-neutral-950/95 p-3 backdrop-blur md:left-64">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <span className="text-sm text-white/60">
            {dirty ? (
              <span className="text-orange-400 font-medium">● Unsaved attendance changes</span>
            ) : (
              "✓ All changes saved"
            )}
          </span>
          <button
            className="btn !bg-orange-500 hover:!bg-orange-600 font-semibold"
            disabled={!dirty || saving}
            onClick={() => setConfirmSave(true)}
          >
            {saving ? "Saving..." : "Save Attendance"}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmSave}
        title="Save Attendance?"
        text={`Save attendance for ${present} present / ${t.members.length - present} absent on ${fmtDate(date)}?`}
        onYes={() => {
          setConfirmSave(false);
          save();
        }}
        onNo={() => setConfirmSave(false)}
      />
    </div>
  );
}
