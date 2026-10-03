// Creates the demo cafe's staff logins (owner, counter, kitchen). Safe to re-run.
//
//   npm run seed:staff            → local Docker Supabase (.env.development.local)
//   npm run seed:staff -- --cloud → cloud project (.env.local)

import { createClient } from "@supabase/supabase-js";

import { DEMO_PASSWORD, DEMO_STAFF } from "../lib/demo";
import { staffEmail } from "../lib/staff-email";

const cloud = process.argv.includes("--cloud");
process.loadEnvFile(cloud ? ".env.local" : ".env.development.local");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) throw new Error("Supabase URL and secret key must be set");

const supabase = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

async function findUserId(email: string): Promise<string | null> {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const user = data.users.find((u) => u.email === email);
    if (user) return user.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function main() {
  const { data: cafe, error } = await supabase.from("cafes").select("id, slug, is_demo").eq("slug", "demo").single();
  if (error) throw error;
  if (!cafe.is_demo) throw new Error("The 'demo' cafe isn't marked as a demo; refusing to add public demo logins.");

  for (const account of DEMO_STAFF) {
    const email = staffEmail(cafe.slug, account.username);
    let userId = await findUserId(email);
    if (userId) {
      const { error: updateError } = await supabase.auth.admin.updateUserById(userId, { password: DEMO_PASSWORD });
      if (updateError) throw updateError;
    } else {
      const { data, error: createError } = await supabase.auth.admin.createUser({
        email,
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: { display_name: account.displayName },
      });
      if (createError) throw createError;
      userId = data.user.id;
    }

    const { error: staffError } = await supabase.from("staff").upsert(
      { cafe_id: cafe.id, user_id: userId, username: account.username, display_name: account.displayName, role: account.role, active: true },
      { onConflict: "user_id" },
    );
    if (staffError) throw staffError;
    console.log(`✓ ${account.role.padEnd(8)} ${account.username}`);
  }
  console.log(`Demo staff ready on ${cloud ? "the cloud project" : "local Supabase"}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
