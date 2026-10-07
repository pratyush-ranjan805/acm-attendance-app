import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/auth";
import { getMovementHistory } from "@/server/services/movementService";
import ExcelJS from "exceljs";

export async function GET(req: NextRequest) {
  const admin = await authenticateRequest(req);
  if (!admin) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const history = await getMovementHistory(1000);
    const wb = new ExcelJS.Workbook();
    wb.creator = "ACM SIGGRAPH Attendance System";
    wb.created = new Date();

    const ws = wb.addWorksheet("Room Movements", {
      views: [{ state: "frozen", ySplit: 1 }],
    });

    ws.columns = [
      { header: "Participant Name", key: "name", width: 25 },
      { header: "Registration Number", key: "regNo", width: 22 },
      { header: "Phone Number", key: "phone", width: 18 },
      { header: "Team Name", key: "teamName", width: 22 },
      { header: "Team Code", key: "teamCode", width: 15 },
      { header: "Status", key: "status", width: 12 },
      { header: "Reason", key: "reason", width: 15 },
      { header: "Note / Details", key: "customReason", width: 25 },
      { header: "Out Time", key: "outTime", width: 22 },
      { header: "In Time", key: "inTime", width: 22 },
      { header: "Duration (Mins)", key: "duration", width: 16 },
      { header: "Marked By", key: "markedBy", width: 18 },
    ];

    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFEA580C" }, // ACM Orange
    };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    headerRow.height = 28;

    for (const h of history) {
      const row = ws.addRow({
        name: h.participantName,
        regNo: h.registrationNumber,
        phone: h.phoneNumber,
        teamName: h.teamName,
        teamCode: h.teamCode,
        status: h.status,
        reason: h.reason,
        customReason: h.customReason || "—",
        outTime: h.outTime ? new Date(h.outTime).toLocaleString() : "—",
        inTime: h.inTime ? new Date(h.inTime).toLocaleString() : "Still OUT",
        duration: h.durationMinutes,
        markedBy: h.markedBy || "Admin",
      });

      row.alignment = { vertical: "middle" };
      row.height = 22;

      // Colorize status cell
      const statusCell = row.getCell("status");
      if (h.status === "OUT") {
        statusCell.font = { color: { argb: "FFDC2626" }, bold: true };
      } else {
        statusCell.font = { color: { argb: "FF16A34A" }, bold: true };
      }
    }

    const buffer = await wb.xlsx.writeBuffer();
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="room-movement-report-${new Date().toLocaleDateString("en-CA")}.xlsx"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { message: (error as Error).message || "Failed to export room movement" },
      { status: 500 }
    );
  }
}
