import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/auth";
import { getMovementData } from "@/server/services/movementService";

export async function GET(req: NextRequest) {
  const admin = await authenticateRequest(req);
  if (!admin) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || undefined;
    const filter = (searchParams.get("filter") as "all" | "out" | "in") || "all";

    const data = await getMovementData(search, filter);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { message: (error as Error).message || "Failed to load movement data" },
      { status: 500 }
    );
  }
}
