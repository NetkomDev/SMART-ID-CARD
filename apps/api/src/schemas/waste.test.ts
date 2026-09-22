import { describe, expect, it } from "vitest";
import { calculateWasteMeasurement, KG_PER_KANTONG } from "../../../waste-pwa/src/waste-calculation.js";
import { createWasteSchema } from "./waste.js";

const id = "0199b4dc-3ea3-7d25-b493-0b998dbafabe";

describe("waste contract", () => {
  it("rejects zero totals", () => {
    expect(createWasteSchema.safeParse({
      event_id: id,
      class_id: id,
      student_id: id,
      organic_kg: 0,
      inorganic_kg: 0,
      source: "MANUAL"
    }).success).toBe(false);
  });

  it("accepts scale source", () => {
    expect(createWasteSchema.safeParse({
      event_id: id,
      class_id: id,
      student_id: id,
      organic_kg: 1.25,
      inorganic_kg: 0.5,
      source: "SCALE"
    }).success).toBe(true);
  });

  it("converts bags to kilograms, rounds to three decimals, and uses manual source", () => {
    expect(KG_PER_KANTONG).toBe(0.5);
    expect(calculateWasteMeasurement(2.345, "KTG", "ORGANIC")).toEqual({
      organic_kg: 1.173,
      inorganic_kg: 0,
      total_kg: 1.173,
      source: "MANUAL"
    });
  });

  it("keeps kilogram input as scale-sourced inorganic weight", () => {
    expect(calculateWasteMeasurement(1.234, "KG", "INORGANIC")).toEqual({
      organic_kg: 0,
      inorganic_kg: 1.234,
      total_kg: 1.234,
      source: "SCALE"
    });
  });
});
