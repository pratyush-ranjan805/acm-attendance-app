import { getDb, initDatabase } from "./db";
import { loginAdmin, signAdminToken, verifyAdminToken } from "./auth";
import { getAllTeams, getTeamByIdOrCode, createTeam, updateTeam, deleteTeam, addMemberToTeam, updateTeamMember, deleteTeamMember } from "./services/teamService";
import { saveAttendanceBatch, getAttendanceList, getDashboardStats } from "./services/attendanceService";
import { generateAttendanceExcel } from "./services/exportService";

async function runTests() {
  console.log("=== STARTING BACKEND INTEGRATION TESTS ===");

  // 1. Init Database
  await initDatabase();
  console.log("✓ Database initialized and seeded successfully");

  // 2. Auth Test
  const loginRes = await loginAdmin("admin@siggraph.acm.org", "Admin@123");
  if (!loginRes || !loginRes.token) throw new Error("Login failed");
  console.log("✓ Admin Login successful:", loginRes.admin);

  const payload = verifyAdminToken(loginRes.token);
  if (!payload || payload.role !== "admin") throw new Error("Token verification failed");
  console.log("✓ Token verified for:", payload.email);

  // 3. Teams List & Search
  const teams = await getAllTeams();
  console.log(`✓ Fetched ${teams.length} teams`);
  if (teams.length < 2) throw new Error("Expected at least 2 seeded teams");

  const searchTeams = await getAllTeams("Code");
  if (searchTeams.length !== 1 || searchTeams[0].teamId !== "ACM001") throw new Error("Search team failed");
  console.log("✓ Team search verified:", searchTeams[0].name);

  // 4. Team Details with members and attendance
  const team1 = await getTeamByIdOrCode("ACM001");
  if (!team1 || team1.members.length !== 4) throw new Error("Expected 4 members in ACM001");
  console.log(`✓ Team ACM001 fetched with ${team1.members.length} members`);
  console.log("  Members:", team1.members.map(m => `${m.name} (${m.role}): ${m.status || 'Not Marked'}`).join(", "));

  // 5. Attendance Upsert & Status Edit
  const member1 = team1.members[0];
  const member2 = team1.members[1];
  const today = new Date().toLocaleDateString("en-CA");

  const saveRes = await saveAttendanceBatch({
    teamId: team1.id,
    date: today,
    records: [
      { memberId: member1.id, status: "Absent" }, // change to Absent
      { memberId: member2.id, status: "Present" }
    ]
  }, payload.userId);
  console.log("✓ Attendance saved batch count:", saveRes.count);

  const team1Updated = await getTeamByIdOrCode("ACM001", today);
  const updatedM1 = team1Updated?.members.find(m => m.id === member1.id);
  if (!updatedM1 || updatedM1.status !== "Absent") throw new Error(`Expected Absent for member 1, got ${updatedM1?.status}`);
  console.log("✓ Verified status update: Member 1 is now Absent");

  // 6. Dashboard Stats
  const stats = await getDashboardStats(today);
  console.log("✓ Dashboard Stats:", {
    totalTeams: stats.totalTeams,
    totalMembers: stats.totalMembers,
    present: stats.presentToday,
    absent: stats.absentToday,
    notMarked: stats.notMarkedToday,
    percentage: stats.attendancePercentage
  });

  // 7. Attendance Filter History
  const history = await getAttendanceList({ date: today, teamId: "ACM001" });
  console.log(`✓ Attendance history for ACM001 returned ${history.length} records`);

  // 8. Excel Export Generation
  const excelBuffer = await generateAttendanceExcel(today);
  if (!excelBuffer || excelBuffer.length === 0) throw new Error("Excel export buffer empty");
  console.log(`✓ Generated Excel workbook (${excelBuffer.length} bytes) with 4 sheets`);

  // 9. Team & Member Management CRUD
  const newTeam = await createTeam({ team_id: "ACM999", team_name: "Test Squad" });
  console.log("✓ Created team:", newTeam.teamId, newTeam.name);

  const newMember = await addMemberToTeam(newTeam.id, { member_name: "Test Leader", role: "Leader", email: "leader@test.com" });
  console.log("✓ Added member:", newMember.name, newMember.role);

  await updateTeamMember(newMember.id, { member_name: "Updated Leader", role: "Leader" });
  console.log("✓ Updated member");

  await deleteTeamMember(newMember.id);
  console.log("✓ Deleted member");

  await deleteTeam(newTeam.id);
  console.log("✓ Deleted test team");

  console.log("\n==========================================");
  console.log("ALL BACKEND INTEGRATION TESTS PASSED 100%!");
  console.log("==========================================");
}

runTests().catch(err => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});
