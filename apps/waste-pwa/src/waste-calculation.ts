export const KG_PER_KANTONG = 0.5;

export type WasteUnit = "KG" | "KTG";
export type WasteType = "ORGANIC" | "INORGANIC";

export interface WasteMeasurement {
  organic_kg: number;
  inorganic_kg: number;
  total_kg: number;
  source: "MANUAL" | "SCALE";
}

function roundKilograms(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

export function calculateWasteMeasurement(
  value: number,
  unit: WasteUnit,
  wasteType: WasteType
): WasteMeasurement {
  const totalKg = roundKilograms(unit === "KTG" ? value * KG_PER_KANTONG : value);

  return {
    organic_kg: wasteType === "ORGANIC" ? totalKg : 0,
    inorganic_kg: wasteType === "INORGANIC" ? totalKg : 0,
    total_kg: totalKg,
    source: unit === "KTG" ? "MANUAL" : "SCALE"
  };
}
