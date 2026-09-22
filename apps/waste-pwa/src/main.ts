import "./style.css";
import {
  calculateWasteMeasurement,
  type WasteType,
  type WasteUnit
} from "./waste-calculation.js";

const form = document.querySelector<HTMLFormElement>("#form")!;
const totalOutput = document.querySelector<HTMLOutputElement>("#total")!;
const weightInput = document.querySelector<HTMLInputElement>("#weight-input")!;
const unitSelect = document.querySelector<HTMLSelectElement>("#unit-select")!;

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  void navigator.serviceWorker.register("/sw.js");
}

function currentMeasurement() {
  const wasteType = form.elements.namedItem("waste_type") as HTMLSelectElement;
  return calculateWasteMeasurement(
    Number(weightInput.value),
    unitSelect.value as WasteUnit,
    wasteType.value as WasteType
  );
}

function updateTotal(): void {
  totalOutput.value = `Total ${currentMeasurement().total_kg.toFixed(3)} kg`;
}

form.addEventListener("input", updateTotal);
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const measurement = currentMeasurement();
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
      // total_kg is calculated for display and verification; PostgreSQL stores
      // it as a generated column from these two normalized kilogram fields.
      organic_kg: measurement.organic_kg,
      inorganic_kg: measurement.inorganic_kg,
      source: measurement.source
    })
  });
  document.querySelector("#message")!.textContent = response.ok
    ? "Setoran berhasil disimpan."
    : "Transaksi gagal. Periksa data dan akses petugas.";
});
