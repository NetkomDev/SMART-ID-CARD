import "./style.css";

const KG_PER_KANTONG = 0.5;
const form = document.querySelector<HTMLFormElement>("#form")!;
const totalOutput = document.querySelector<HTMLOutputElement>("#total")!;
const weightInput = document.querySelector<HTMLInputElement>("#weight-input")!;
const unitSelect = document.querySelector<HTMLSelectElement>("#unit-select")!;

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  void navigator.serviceWorker.register("/sw.js");
}

function weightInKg(): number {
  const value = Number(weightInput.value);
  const kilograms = unitSelect.value === "KTG" ? value * KG_PER_KANTONG : value;
  return Math.round(kilograms * 1000) / 1000;
}

function updateTotal(): void {
  totalOutput.value = `Total ${weightInKg().toFixed(3)} kg`;
}

form.addEventListener("input", updateTotal);
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const kilograms = weightInKg();
  const isOrganic = data.get("waste_type") === "ORGANIC";
  const token = sessionStorage.getItem("aksis.waste.token");
  const school = sessionStorage.getItem("aksis.waste.school");
  const response = await fetch("/api/v1/waste/transactions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      "x-school-id": school ?? ""
    },
    body: JSON.stringify({
      event_id: data.get("event"),
      class_id: data.get("class"),
      student_id: data.get("student"),
      organic_kg: isOrganic ? kilograms : 0,
      inorganic_kg: isOrganic ? 0 : kilograms,
      source: unitSelect.value === "KTG" ? "MANUAL" : "SCALE"
    })
  });
  document.querySelector("#message")!.textContent = response.ok
    ? "Setoran berhasil disimpan."
    : "Transaksi gagal. Periksa data dan akses petugas.";
});
