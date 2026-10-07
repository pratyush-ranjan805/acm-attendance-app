"use client";
import { TeamSearch } from "@/components/Team";

export default function Teams() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Teams & Members</h1>
        <p className="text-xs text-white/60 mt-1">
          Showing only <span className="text-blue-300 font-medium">staged</span> and{" "}
          <span className="text-purple-300 font-medium">shortlisted</span> teams from the IG portal
        </p>
      </div>

      <TeamSearch />
    </div>
  );
}
