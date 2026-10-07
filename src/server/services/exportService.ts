import ExcelJS from "exceljs";
import { getAttendanceList, getDashboardStats } from "./attendanceService";
import { getAllTeams } from "./teamService";

export async function generateAttendanceExcel(targetDate?: string): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ACM SIGGRAPH Attendance System";
  workbook.lastModifiedBy = "Admin";
  workbook.created = new Date();
  workbook.modified = new Date();

  const filterDate = targetDate ? targetDate.trim() : undefined;
  const attendanceRecords = await getAttendanceList({ date: filterDate });
  const teams = await getAllTeams();
  const stats = await getDashboardStats(filterDate);

  const headerFill: ExcelJS.Fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1E293B" }, // Dark slate
  };

  const headerFont: Partial<ExcelJS.Font> = {
    name: "Calibri",
    size: 11,
    bold: true,
    color: { argb: "FFFFFFFF" },
  };

  const borderStyle: Partial<ExcelJS.Borders> = {
    top: { style: "thin", color: { argb: "FFE2E8F0" } },
    left: { style: "thin", color: { argb: "FFE2E8F0" } },
    bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
    right: { style: "thin", color: { argb: "FFE2E8F0" } },
  };

  // -------------------------------------------------------------
  // Sheet 1: Attendance
  // -------------------------------------------------------------
  const wsAttendance = workbook.addWorksheet("Attendance", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  wsAttendance.columns = [
    { header: "Date", key: "date", width: 14 },
    { header: "Team Code", key: "teamId", width: 14 },
    { header: "Team Name", key: "teamName", width: 24 },
    { header: "Member Name", key: "memberName", width: 24 },
    { header: "Reg. Number", key: "registrationNumber", width: 18 },
    { header: "Department", key: "department", width: 20 },
    { header: "Role", key: "role", width: 14 },
    { header: "Status", key: "status", width: 14 },
    { header: "Marked Time (IST)", key: "markedAt", width: 22 },
  ];

  const headerRow1 = wsAttendance.getRow(1);
  headerRow1.eachCell((cell) => {
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.alignment = { vertical: "middle", horizontal: "left" };
  });
  headerRow1.height = 24;

  for (const rec of attendanceRecords) {
    let formattedTime = "-";
    if (rec.markedAt) {
      try {
        const d = new Date(rec.markedAt);
        if (!isNaN(d.getTime())) {
          formattedTime = d.toLocaleTimeString("en-IN", {
            timeZone: "Asia/Kolkata",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: true,
          });
        }
      } catch {
        formattedTime = String(rec.markedAt);
      }
    }

    const row = wsAttendance.addRow({
      date: rec.date,
      teamId: rec.teamId,
      teamName: rec.teamName,
      memberName: rec.memberName,
      registrationNumber: (rec as any).registrationNumber || "-",
      department: (rec as any).department || "-",
      role: rec.role,
      status: rec.status,
      markedAt: formattedTime,
    });

    row.eachCell((cell, colNumber) => {
      cell.border = borderStyle;
      if (colNumber === 8) {
        // Status column
        cell.font = {
          bold: true,
          color: { argb: rec.status === "Present" ? "FF16A34A" : "FFDC2626" },
        };
      }
    });
  }

  // -------------------------------------------------------------
  // Sheet 2: Teams
  // -------------------------------------------------------------
  const wsTeams = workbook.addWorksheet("Teams", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  wsTeams.columns = [
    { header: "Team ID", key: "teamId", width: 16 },
    { header: "Team Name", key: "teamName", width: 28 },
    { header: "Total Members", key: "memberCount", width: 16 },
    { header: "Created At", key: "createdAt", width: 22 },
  ];

  const headerRow2 = wsTeams.getRow(1);
  headerRow2.eachCell((cell) => {
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.alignment = { vertical: "middle", horizontal: "left" };
  });
  headerRow2.height = 24;

  for (const t of teams) {
    const row = wsTeams.addRow({
      teamId: t.teamId,
      teamName: t.name,
      memberCount: t.members.length,
      createdAt: t.created_at ? new Date(t.created_at).toISOString().split("T")[0] : "-",
    });
    row.eachCell((cell) => {
      cell.border = borderStyle;
    });
  }

  // -------------------------------------------------------------
  // Sheet 3: Members
  // -------------------------------------------------------------
  const wsMembers = workbook.addWorksheet("Members", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  wsMembers.columns = [
    { header: "Team Code", key: "teamId", width: 16 },
    { header: "Team Name", key: "teamName", width: 26 },
    { header: "Member Name", key: "name", width: 24 },
    { header: "Reg. Number", key: "registrationNumber", width: 18 },
    { header: "Department", key: "department", width: 22 },
    { header: "Role", key: "role", width: 14 },
    { header: "Email", key: "email", width: 30 },
  ];

  const headerRow3 = wsMembers.getRow(1);
  headerRow3.eachCell((cell) => {
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.alignment = { vertical: "middle", horizontal: "left" };
  });
  headerRow3.height = 24;

  for (const t of teams) {
    for (const m of t.members) {
      const row = wsMembers.addRow({
        teamId: t.teamId,
        teamName: t.name,
        name: m.name,
        registrationNumber: (m as any).registrationNumber || "-",
        department: (m as any).department || "-",
        role: m.role,
        email: m.email || "-",
      });
      row.eachCell((cell) => {
        cell.border = borderStyle;
      });
    }
  }

  // -------------------------------------------------------------
  // Sheet 4: Summary
  // -------------------------------------------------------------
  const wsSummary = workbook.addWorksheet("Summary", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  wsSummary.columns = [
    { header: "Metric / Field", key: "metric", width: 28 },
    { header: "Value", key: "value", width: 34 },
  ];

  const headerRow4 = wsSummary.getRow(1);
  headerRow4.eachCell((cell) => {
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.alignment = { vertical: "middle", horizontal: "left" };
  });
  headerRow4.height = 24;

  const summaryData = [
    { metric: "Club / Organization", value: "ACM SIGGRAPH" },
    { metric: "Export Scope", value: filterDate ? `Date: ${filterDate}` : "All Records" },
    { metric: "Total Teams", value: stats.totalTeams },
    { metric: "Total Registered Members", value: stats.totalMembers },
    { metric: "Present Count", value: stats.presentToday },
    { metric: "Absent Count", value: stats.absentToday },
    { metric: "Not Marked Count", value: stats.notMarkedToday },
    { metric: "Attendance Rate", value: `${stats.attendancePercentage}%` },
    { metric: "Report Generated At", value: new Date().toISOString() },
  ];

  for (const item of summaryData) {
    const row = wsSummary.addRow(item);
    row.eachCell((cell, colNumber) => {
      cell.border = borderStyle;
      if (colNumber === 1) cell.font = { bold: true };
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
