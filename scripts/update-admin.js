const bcrypt = require("bcryptjs");

const SUPABASE_URL = "https://djcdjazeombnxtofsujd.supabase.co";
const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqY2RqYXplb21ibnh0b2ZzdWpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTI2OTI0OSwiZXhwIjoyMTA2ODQ1MjQ5fQ.D5UBVcsU6SpXgvCxRDu396zyYAJBMoVae2vX2pbb4i8";

async function supabaseFetch(path, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "apikey": SERVICE_KEY,
      "Authorization": `Bearer ${SERVICE_KEY}`,
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
  const newEmail = "srmacmsiggraph@gmail.com";
  const newPassword = "ACMadmin@26";

  console.log("Hashing new password...");
  const hash = await bcrypt.hash(newPassword, 10);

  // Delete old admin and insert new one (clean slate)
  console.log("Removing old admin records...");
  await supabaseFetch("admins?role=eq.admin", {
    method: "DELETE",
    headers: { "Prefer": "" },
  });

  console.log("Inserting new admin...");
  const res = await supabaseFetch("admins", {
    method: "POST",
    body: JSON.stringify({
      name: "ACM SIGGRAPH Admin",
      email: newEmail,
      password_hash: hash,
      role: "admin",
    }),
  });

  if (res.ok) {
    console.log("✅ Admin updated successfully!");
    console.log(`   Email:    ${newEmail}`);
    console.log(`   Password: ${newPassword}`);
  } else {
    console.log("❌ Error:", res.data?.message || JSON.stringify(res.data));
  }
}

main().catch(console.error);
