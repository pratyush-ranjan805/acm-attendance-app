import { NextRequest, NextResponse } from "next/server";
import { generateAttendanceExcel } from "@/server/services/exportService";
import { authenticateRequest } from "@/server/auth";

export async function GET(req: NextRequest) {
  try {
    const admin = await authenticateRequest(req);
    if (!admin) {
      return NextResponse.json({ message: "Unauthorized. Admin access only." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date") || undefined;

    const buffer = await generateAttendanceExcel(date);
    const filename = `siggraph-attendance-${date || "all"}.xlsx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { message: (error as Error).message || "Failed to generate Excel export." },
      { status: 500 }
    );
  }
}
