import { NextResponse } from "next/server";
import { generateImportTemplate } from "@/server/services/importService";

export async function GET() {
  try {
    const buffer = await generateImportTemplate();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="acm-teams-registration-template.xlsx"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { message: (error as Error).message || "Failed to generate template." },
      { status: 500 }
    );
  }
}
