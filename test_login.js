const email = "superadmin@aksis.co.id";
const password = "password123";

async function run() {
  const loginRes = await fetch("http://localhost:3000/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const loginData = await loginRes.json();
  const token = loginData.data.session.access_token;
  const schoolId = loginData.data.schools[0].school_id;

  const contextRes = await fetch("http://localhost:3000/api/v1/schools/current/context", {
    headers: { 
      "Authorization": `Bearer ${token}`,
      "X-School-Id": schoolId
    }
  });
  const contextData = await contextRes.json();
  console.log(JSON.stringify(contextData, null, 2));
}
run();
