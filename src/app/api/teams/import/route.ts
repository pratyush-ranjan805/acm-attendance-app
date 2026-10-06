import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/auth";
import { parseFileToTeams, importTeamsAndMembers } from "@/server/services/importService";

export async function POST(req: NextRequest) {
  try {
    const admin = await authenticateRequest(req);
    if (!admin) {
      return NextResponse.json({ message: "Unauthorized. Admin access only." }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const clearExisting = formData.get("clearExisting") === "true";

    if (!file) {
      return NextResponse.json({ message: "No file was uploaded." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsedTeams = await parseFileToTeams(buffer, file.name);

    const result = await importTeamsAndMembers(parsedTeams, clearExisting);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { message: (error as Error).message || "Failed to process import." },
      { status: 400 }
    );
  }
}
