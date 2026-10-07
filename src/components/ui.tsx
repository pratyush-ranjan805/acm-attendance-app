"use client";
import { createContext, useCallback, useContext, useEffect, useState, ReactNode, DependencyList } from "react";
import { ApiError, clearClientCache, shift, today } from "@/lib/api";

const T = createContext<(m: string, ok?: boolean) => void>(() => {});
export const useToast = () => useContext(T);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [l, s] = useState<{ id: number; m: string; ok: boolean }[]>([]);
  const push = useCallback((m: string, ok = true) => {
    const id = Math.random(); s((x) => [...x, { id, m, ok }]); setTimeout(() => s((x) => x.filter((i) => i.id !== id)), 4000);
  }, []);
  return <T.Provider value={push}>{children}
    <div className="fixed bottom-4 right-4 z-[60] space-y-2" role="status" aria-live="polite">
      {l.map((t) => <div key={t.id} className={`rounded-lg border px-4 py-3 text-sm ${t.ok ? "border-acm/50 bg-neutral-900" : "border-red-500/60 bg-red-950"}`}>{t.m}</div>)}
    </div></T.Provider>;
}

export function useLoad<T>(fn: () => Promise<T>, deps: DependencyList) {
  const [data, setData] = useState<T | null>(null); const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(true); const [n, setN] = useState(0);
  useEffect(() => {
    let live = true; setLoading(true); setError(null);
    fn().then((d) => live && setData(d)).catch((e: ApiError) => live && setError(e.message)).finally(() => live && setLoading(false));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  return { data, error, loading, reload: () => { clearClientCache(); setN((x) => x + 1); }, setData };
}

export const Skeleton = ({ rows = 3 }: { rows?: number }) => (
  <div className="space-y-3" aria-busy="true">{Array.from({ length: rows }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-white/5" />)}</div>);
export const ErrorBox = ({ msg, retry }: { msg: string; retry?: () => void }) => (
  <div className="card border-red-500/40 p-6 text-center"><p className="font-medium">Unable to load data</p><p className="mt-1 text-sm text-white/60">{msg}</p>
    {retry && <button className="btn-ghost mt-4" onClick={retry}>Try again</button>}</div>);
export const Empty = ({ msg }: { msg: string }) => <div className="card p-8 text-center text-white/60">{msg}</div>;

export function ConfirmDialog({ open, title, text, onYes, onNo }: { open: boolean; title: string; text: string; onYes: () => void; onNo: () => void }) {
  if (!open) return null;
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label={title}>
    <div className="card w-full max-w-sm p-6"><h3 className="text-lg font-semibold">{title}</h3><p className="mt-2 text-sm text-white/60">{text}</p>
      <div className="mt-5 flex justify-end gap-2"><button className="btn-ghost" onClick={onNo}>Cancel</button><button className="btn" onClick={onYes}>Confirm</button></div></div></div>;
}

export function DateSelector({ value, onChange }: { value: string; onChange: (d: string) => void }) {
  const chip = (l: string, d: string) => <button key={l} onClick={() => onChange(d)} className={`rounded-lg px-3 py-1.5 text-sm ${value === d ? "bg-acm text-black" : "border border-white/15 hover:bg-white/5"}`}>{l}</button>;
  return <div className="flex flex-wrap items-center gap-2"><span className="text-sm text-white/60">Attendance date</span>
    {chip("Today", today())}{chip("Yesterday", shift(-1))}
    <input type="date" aria-label="Custom date" className="input w-auto" value={value} onChange={(e) => e.target.value && onChange(e.target.value)} /></div>;
}

export const Stat = ({ label, value }: { label: string; value: string | number }) => (
  <div className="card p-4"><p className="text-sm text-white/60">{label}</p><p className="mt-1 text-3xl font-bold text-acm">{value}</p></div>);
