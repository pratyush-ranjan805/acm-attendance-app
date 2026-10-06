import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/auth";

export async function GET(req: NextRequest) {
  const admin = await authenticateRequest(req);
  if (!admin) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    admin: {
      userId: admin.userId,
      name: admin.name,
      email: admin.email,
      role: admin.role,
    },
  });
}
