import { createClient } from "@supabase/supabase-js";
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function run() {
  const { data } = await admin.from("parent_student_links").select("id, portal_session_id").limit(10);
  console.log(JSON.stringify(data, null, 2));
}
run();
