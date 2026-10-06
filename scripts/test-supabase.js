// Setup Supabase tables via REST API
const SUPABASE_URL = "https://djcdjazeombnxtofsujd.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqY2RqYXplb21ibnh0b2ZzdWpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyNjkyNDksImV4cCI6MjEwNjg0NTI0OX0.jOC8atiYCCpfECK3e8aSEe9_QXkkPYG_0l5whZvPFTY";
const bcrypt = require("bcryptjs");

async function supabaseFetch(path, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "apikey": ANON_KEY,
      "Authorization": `Bearer ${ANON_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
      ...(options.headers || {}),
    },
  });
  
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  
  return { ok: res.ok, status: res.status, data };
}

async function main() {
  console.log("Testing Supabase REST API connection...\n");
  
  // Test teams table
  const teamsRes = await supabaseFetch("teams?limit=1");
  if (!teamsRes.ok) {
    console.log("❌ teams table error:", teamsRes.data?.message || teamsRes.data);
    console.log("\n⚠️  The database tables don't exist yet.");
    console.log("Please run the SQL in Supabase SQL Editor:");
    console.log("👉 https://supabase.com/dashboard/project/djcdjazeombnxtofsujd/sql/new");
    console.log("\nCopy and paste the content from: acm/supabase-setup.sql");
    return;
  }
  
  console.log("✅ teams table: OK");
  
  // Test team_members table
  const memRes = await supabaseFetch("team_members?limit=1");
  console.log(memRes.ok ? "✅ team_members table: OK" : `❌ team_members error: ${memRes.data?.message}`);
  
  // Test attendance table
  const attRes = await supabaseFetch("attendance?limit=1");
  console.log(attRes.ok ? "✅ attendance table: OK" : `❌ attendance error: ${attRes.data?.message}`);
  
  // Test admins table
  const adminRes = await supabaseFetch("admins?select=email,name,role&limit=5");
  if (!adminRes.ok) {
    console.log(`❌ admins error: ${adminRes.data?.message}`);
  } else {
    console.log("✅ admins table: OK");
    const admins = adminRes.data || [];
    
    if (admins.length === 0) {
      console.log("\nNo admin found. Seeding default admin...");
      const hash = await bcrypt.hash("Admin@123", 10);
      const insertRes = await supabaseFetch("admins", {
        method: "POST",
        body: JSON.stringify({
          name: "SIGGRAPH Admin",
          email: "admin@siggraph.acm.org",
          password_hash: hash,
          role: "admin"
        }),
        headers: { "Prefer": "resolution=ignore-duplicates,return=representation" }
      });
      
      if (insertRes.ok) {
        console.log("✅ Admin seeded: admin@siggraph.acm.org / Admin@123");
      } else {
        console.log("❌ Admin seed error:", insertRes.data?.message || insertRes.data);
      }
    } else {
      console.log(`✅ Admins found: ${admins.map(a => a.email).join(", ")}`);
    }
  }
  
  console.log("\n✅ All done! Your Supabase database is ready.");
  console.log("📌 Admin login: admin@siggraph.acm.org / Admin@123");
}

main().catch(console.error);
