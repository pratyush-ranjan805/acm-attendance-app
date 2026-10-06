"use client";
import { useRouter } from "next/navigation"; import { useEffect, useState } from "react"; import { Admin, session } from "@/lib/api";
export default function Settings() {
  const r = useRouter(); const [a, setA] = useState<Admin | null>(null); useEffect(() => setA(session.admin()), []);
  return <div className="max-w-md space-y-5"><h1 className="text-2xl font-bold">Settings</h1><div className="card space-y-2 p-5"><p className="text-sm text-white/60">Signed in as</p><p className="text-lg font-semibold">{a?.name ?? "Admin"}</p><p className="text-sm">{a?.email}</p>
    <button className="btn mt-3" onClick={() => { session.clear(); r.replace("/login"); }}>Log out</button></div></div>;
}
