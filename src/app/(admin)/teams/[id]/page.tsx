"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, Member, Status, today, fmtDate } from "@/lib/api";
import { ConfirmDialog, DateSelector, ErrorBox, Skeleton, useLoad, useToast } from "@/components/ui";
import { SwipeableMemberRow } from "@/components/SwipeableMemberRow";

export default function TeamDetails() {
  const id = decodeURIComponent(useParams<{ id: string }>().id);
  const r = useRouter();
  const toast = useToast();
  const [date, setDate] = useState(today());
  const [marks, setMarks] = useState<Record<string, Status>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<Member> | null>(null);
  const [del, setDel] = useState<"team" | Member | null>(null);

  const { data: t, error, loading, reload } = useLoad(() => api.team(id, date), [id, date]);

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
      void res;
      reload();
    } catch (e) {
      toast(`Not saved: ${(e as Error).message}`, false);
    }
    setSaving(false);
  }

  async function saveMember() {
    if (!form?.name) return;
    try {
      if (form.id) await api.editMember(id, form.id, form);
      else await api.addMember(id, { role: "Member", ...form });
      toast("Member saved");
      setForm(null);
      reload();
    } catch (e) {
      toast((e as Error).message, false);
    }
  }

  async function confirmDel() {
    const d = del;
    setDel(null);
    if (!d) return;
    try {
      if (d === "team") {
        await api.delTeam(id);
        toast("Team deleted successfully");
        r.replace("/teams");
      } else {
        await api.delMember(id, d.id);
        toast("Member deleted");
        reload();
      }
    } catch (e) {
      toast((e as Error).message, false);
    }
  }

  if (loading) return <Skeleton rows={4} />;
  if (error || !t) return <ErrorBox msg={error ?? "Team not found"} retry={reload} />;

  return (
    <div className="space-y-5 pb-24">
      <Link href="/teams" className="text-sm text-orange-400 hover:underline">
        ← Back to Teams
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold uppercase text-white">{t.name}</h1>
          <p className="text-white/60">
            Team ID: <span className="font-mono text-orange-400 font-semibold">{t.teamId}</span> · {t.members.length} members
          </p>
        </div>
        <button className="btn-ghost !text-red-400 hover:!bg-red-500/10 text-xs" onClick={() => setDel("team")}>
          Delete Team
        </button>
      </div>

      <DateSelector value={date} onChange={changeDate} />

      <div className="card p-4 border border-white/10 flex items-center justify-between">
        <div>
          <p className="text-xs text-white/60">Attendance for {fmtDate(date)}</p>
          <p className="text-3xl font-bold text-orange-400 mt-0.5">
            {present} / {t.members.length} Present
          </p>
        </div>
        <div className="text-xs text-white/40 text-right hidden sm:block">
          Swipe right → Present<br />
          ← Swipe left for Absent
        </div>
      </div>

      {/* Swipeable Member List */}
      <div className="space-y-2">
        {t.members.length === 0 && (
          <div className="card p-8 text-center text-white/60">
            No members registered yet. Click &quot;+ Add Member&quot; below.
          </div>
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
            onEdit={(mem) => setForm(mem)}
            onDelete={(mem) => setDel(mem)}
          />
        ))}
      </div>

      {/* Member Form */}
      {form ? (
        <div className="card grid gap-3 p-4 md:grid-cols-4 border border-orange-500/30">
          <input
            className="input"
            placeholder="Member name"
            value={form.name ?? ""}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            className="input"
            placeholder="Email (optional)"
            value={form.email ?? ""}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <select
            className="input"
            value={form.role ?? "Member"}
            onChange={(e) => setForm({ ...form, role: e.target.value as Member["role"] })}
          >
            <option value="Member">Member</option>
            <option value="Leader">Leader</option>
          </select>
          <div className="flex gap-2">
            <button className="btn !bg-orange-500 hover:!bg-orange-600" onClick={saveMember}>
              Save Member
            </button>
            <button className="btn-ghost" onClick={() => setForm(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button className="btn-ghost border border-white/10" onClick={() => setForm({ role: "Member" })}>
          + Add Member
        </button>
      )}

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
            onClick={save}
          >
            {saving ? "Saving..." : "Save Attendance"}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={!!del}
        title={del === "team" ? "Delete this team?" : "Delete this member?"}
        text="This can't be undone."
        onYes={confirmDel}
        onNo={() => setDel(null)}
      />
    </div>
  );
}
