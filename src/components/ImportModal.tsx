"use client";
import { useState, useRef, DragEvent, ChangeEvent } from "react";
import { api } from "@/lib/api";
import { useToast, ConfirmDialog } from "./ui";

export function ImportModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [clearExisting, setClearExisting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  if (!open) return null;

  function handleFileDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  }

  function handleFileSelect(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      validateAndSetFile(e.target.files[0]);
    }
  }

  function validateAndSetFile(selected: File) {
    const validExts = [".xlsx", ".xls", ".csv", ".pdf"];
    const ext = "." + selected.name.split(".").pop()?.toLowerCase();
    if (!validExts.includes(ext)) {
      toast("Invalid file type. Upload .xlsx, .xls, .csv, or .pdf", false);
      return;
    }
    setFile(selected);
  }

  async function handleImport() {
    if (!file) return;
    setUploading(true);
    try {
      const res = await api.importTeams(file, clearExisting);
      toast(res.message || `Successfully registered ${res.teamsCount} teams!`);
      setFile(null);
      onSuccess();
      onClose();
    } catch (err) {
      toast((err as Error).message, false);
    } finally {
      setUploading(false);
    }
  }

  async function handleClearAll() {
    setClearing(true);
    try {
      await api.clearTeams();
      toast("All teams and attendance records cleared!");
      setConfirmClear(false);
      onSuccess();
    } catch (err) {
      toast((err as Error).message, false);
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-fadeIn">
      <div className="card w-full max-w-xl space-y-5 border border-white/15 bg-neutral-950 p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div>
            <h2 className="text-xl font-bold text-white">Import Teams & Members</h2>
            <p className="text-xs text-white/60">Upload Excel (.xlsx, .xls), CSV, or PDF Roster</p>
          </div>
          <button
            onClick={onClose}
            className="text-white/50 hover:text-white text-xl font-bold px-2 py-1"
          >
            ✕
          </button>
        </div>

        {/* Dropzone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleFileDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-all ${
            dragOver
              ? "border-orange-500 bg-orange-500/10"
              : file
              ? "border-green-500/60 bg-green-500/5"
              : "border-white/20 hover:border-orange-500/60 hover:bg-white/5"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv,.pdf"
            onChange={handleFileSelect}
            className="hidden"
          />
          <div className="flex flex-col items-center gap-2">
            <span className="text-4xl">{file ? "📄" : "📁"}</span>
            {file ? (
              <div>
                <p className="font-semibold text-green-400">{file.name}</p>
                <p className="text-xs text-white/50">{(file.size / 1024).toFixed(1)} KB · Click to change file</p>
              </div>
            ) : (
              <div>
                <p className="font-medium text-white/90">Click to upload or drag & drop</p>
                <p className="text-xs text-white/50">Supports Excel (.xlsx, .xls), CSV (.csv), and PDF (.pdf)</p>
              </div>
            )}
          </div>
        </div>

        {/* Options */}
        <div className="space-y-3 rounded-lg bg-white/5 p-3 text-sm">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={clearExisting}
              onChange={(e) => setClearExisting(e.target.checked)}
              className="rounded border-white/20 text-orange-500 focus:ring-orange-500"
            />
            <span className="text-white/80">
              Clear existing teams before importing (fresh start)
            </span>
          </label>
        </div>

        {/* Action Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => api.downloadTemplate()}
              className="text-xs text-orange-400 hover:underline flex items-center gap-1"
            >
              📥 Download Sample Excel Template
            </button>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="btn-ghost !text-red-400 hover:!bg-red-500/10 text-xs"
            >
              Clear All Data
            </button>
            <button
              type="button"
              onClick={onClose}
              className="btn-ghost"
              disabled={uploading}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={!file || uploading}
              className="btn !bg-orange-500 hover:!bg-orange-600 disabled:opacity-50"
            >
              {uploading ? "Importing Roster..." : "Upload & Register"}
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmClear}
        title="Clear All Teams and Attendance?"
        text="This will delete all teams, members, and marked attendance records from the database. This action cannot be undone."
        onYes={handleClearAll}
        onNo={() => setConfirmClear(false)}
      />
    </div>
  );
}
