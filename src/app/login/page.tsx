"use client";
import { FormEvent, useState } from "react"; import { useRouter } from "next/navigation"; import { api, session } from "@/lib/api"; import { Logo } from "@/components/Shell";
export default function Login() {
  const r = useRouter(); const [email, setE] = useState(""); const [pw, setP] = useState(""); const [show, setShow] = useState(false); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  async function go(ev: FormEvent) {
    ev.preventDefault(); setErr("");
    if (!/^\S+@\S+\.\S+$/.test(email)) return setErr("Enter a valid email address.");
    if (pw.length < 6) return setErr("Password must be at least 6 characters.");
    setBusy(true);
    try {
      const d = await api.login(email, pw);
      session.set(d.token, d.admin);
      window.location.href = "/dashboard";
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return <main className="grid min-h-screen md:grid-cols-2">
    <section className="flex flex-col items-center justify-center gap-5 bg-[radial-gradient(circle_at_30%_20%,rgba(255,106,0,.25),transparent_60%)] p-10 text-center">
      <Logo size={180} /><h1 className="text-3xl font-bold">ACM SIGGRAPH</h1><p className="text-white/70">Admin Attendance Management System</p></section>
    <section className="flex items-center justify-center p-6"><form onSubmit={go} className="card w-full max-w-sm space-y-4 p-6" noValidate>
      <h2 className="text-xl font-semibold">Admin sign in</h2>
      <label className="block text-sm">Email<input type="email" autoComplete="username" className="input mt-1" value={email} onChange={(e) => setE(e.target.value)} /></label>
      <label className="block text-sm">Password<div className="relative"><input type={show ? "text" : "password"} autoComplete="current-password" className="input mt-1 pr-16" value={pw} onChange={(e) => setP(e.target.value)} />
        <button type="button" className="absolute right-2 top-3 text-xs text-acm" onClick={() => setShow(!show)}>{show ? "Hide" : "Show"}</button></div></label>
      {err && <p role="alert" className="text-sm text-red-400">{err}</p>}
      <button className="btn w-full" disabled={busy}>{busy ? "Signing in..." : "Sign In"}</button></form></section></main>;
}
