require('dotenv').config({ path: '.env' });
const { Client } = require('pg');
(async () => {
  // Try to parse Postgres connection string from SUPABASE_URL if possible,
  // or use SUPABASE_DB_URL if available.
  console.log("DB URL:", process.env.SUPABASE_DB_URL ? "Exists" : "Not found");
})();
