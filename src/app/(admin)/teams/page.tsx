"use client";
import { useState } from "react";
import { TeamSearch } from "@/components/Team";
import { ImportModal } from "@/components/ImportModal";
import { RegisterTeamModal } from "@/components/RegisterTeamModal";

export default function Teams() {
  const [manualOpen, setManualOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [k, setK] = useState(0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Teams & Members</h1>
          <p className="text-xs text-white/60">
            Register teams manually or bulk upload via Excel / PDF
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Option 1: Manual Registration */}
          <button
            className="btn !bg-neutral-800 hover:!bg-neutral-700 border border-white/10 flex items-center gap-1.5 text-sm"
            onClick={() => setManualOpen(true)}
          >
            ✏️ Register Team Manually
          </button>

          {/* Option 2: Excel / PDF Upload */}
          <button
            className="btn !bg-orange-600 hover:!bg-orange-700 flex items-center gap-1.5 text-sm"
            onClick={() => setImportOpen(true)}
          >
            📤 Upload Excel / PDF
          </button>
        </div>
      </div>

      <TeamSearch key={k} />

      {/* Manual Registration Modal */}
      <RegisterTeamModal
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        onSuccess={() => setK((prev) => prev + 1)}
      />

      {/* Bulk Upload Modal */}
      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onSuccess={() => setK((prev) => prev + 1)}
      />
    </div>
  );
}
