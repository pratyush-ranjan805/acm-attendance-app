"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "./ui";

interface MemberInput {
  name: string;
  email: string;
  role: "Leader" | "Member";
}

export function RegisterTeamModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const toast = useToast();
  const [teamId, setTeamId] = useState("");
  const [teamName, setTeamName] = useState("");
  const [members, setMembers] = useState<MemberInput[]>([
    { name: "", email: "", role: "Leader" },
    { name: "", email: "", role: "Member" },
  ]);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  function addMemberRow() {
    setMembers([...members, { name: "", email: "", role: "Member" }]);
  }

  function removeMemberRow(index: number) {
    if (members.length <= 1) return;
    setMembers(members.filter((_, i) => i !== index));
  }

  function updateMember(index: number, field: keyof MemberInput, value: string) {
    const updated = [...members];
    updated[index] = { ...updated[index], [field]: value };
    setMembers(updated);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!teamId.trim() || !teamName.trim()) {
      toast("Please enter Team ID and Team Name", false);
      return;
    }

    const validMembers = members.filter((m) => m.name.trim().length > 0);
    if (validMembers.length === 0) {
      toast("Please add at least one team member", false);
      return;
    }

    setSaving(true);
    try {
      // 1. Create Team
      const createdTeam = await api.addTeam({
        teamId: teamId.trim().toUpperCase(),
        name: teamName.trim(),
      });

      // 2. Add each member to the created team
      for (const m of validMembers) {
        await api.addMember(createdTeam.teamId, {
          name: m.name.trim(),
          email: m.email.trim() || undefined,
          role: m.role,
        });
      }

      toast(`Team '${teamName}' and ${validMembers.length} members registered successfully!`);
      // Reset form
      setTeamId("");
      setTeamName("");
      setMembers([
        { name: "", email: "", role: "Leader" },
        { name: "", email: "", role: "Member" },
      ]);
      onSuccess();
      onClose();
    } catch (err) {
      toast((err as Error).message, false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-fadeIn">
      <div className="card w-full max-w-2xl max-h-[90vh] overflow-y-auto space-y-5 border border-white/15 bg-neutral-950 p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div>
            <h2 className="text-xl font-bold text-white">Register Team Manually</h2>
            <p className="text-xs text-white/60">
              Create a new team and add all its members in one step
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white/50 hover:text-white text-xl font-bold px-2 py-1"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Team Info */}
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-white/70 mb-1">
                Team ID / Code <span className="text-orange-500">*</span>
              </label>
              <input
                required
                placeholder="e.g. ACM001"
                className="input"
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-white/70 mb-1">
                Team Name <span className="text-orange-500">*</span>
              </label>
              <input
                required
                placeholder="e.g. Code Warriors"
                className="input"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
              />
            </div>
          </div>

          {/* Members List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-orange-400">
                Team Members
              </label>
              <button
                type="button"
                onClick={addMemberRow}
                className="text-xs text-orange-400 hover:text-orange-300 font-semibold"
              >
                + Add Another Member
              </button>
            </div>

            <div className="space-y-2.5">
              {members.map((m, idx) => (
                <div
                  key={idx}
                  className="flex flex-wrap items-center gap-2 rounded-lg bg-white/5 p-2.5 border border-white/5"
                >
                  <div className="flex-1 min-w-[140px]">
                    <input
                      required={idx === 0}
                      placeholder={idx === 0 ? "Leader Full Name *" : `Member ${idx + 1} Name`}
                      className="input !py-1.5 text-sm"
                      value={m.name}
                      onChange={(e) => updateMember(idx, "name", e.target.value)}
                    />
                  </div>

                  <div className="flex-1 min-w-[140px]">
                    <input
                      type="email"
                      placeholder="Email (Optional)"
                      className="input !py-1.5 text-sm"
                      value={m.email}
                      onChange={(e) => updateMember(idx, "email", e.target.value)}
                    />
                  </div>

                  <div className="w-28">
                    <select
                      className="input !py-1.5 text-sm"
                      value={m.role}
                      onChange={(e) =>
                        updateMember(idx, "role", e.target.value as "Leader" | "Member")
                      }
                    >
                      <option value="Leader">Leader</option>
                      <option value="Member">Member</option>
                    </select>
                  </div>

                  {members.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeMemberRow(idx)}
                      className="text-white/40 hover:text-red-400 px-2 py-1 text-sm font-bold"
                      title="Remove member"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-end gap-3 border-t border-white/10 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="btn-ghost"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn !bg-orange-500 hover:!bg-orange-600 font-semibold"
            >
              {saving ? "Registering Team..." : "Register Team & Members"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
