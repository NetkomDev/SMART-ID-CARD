import { describe, expect, it } from 'vitest';
import { calculateWasteMeasurement } from './waste-calculation';
describe('manual waste input provenance', () => {
  it('does not identify typed kilograms as a connected scale', () => {
    expect(calculateWasteMeasurement(1.25, 'KG', 'ORGANIC')).toEqual({organic_kg:1.25,inorganic_kg:0,total_kg:1.25,source:'MANUAL'});
  });
  it('keeps the existing bag conversion and calculated total', () => {
    expect(calculateWasteMeasurement(2, 'KTG', 'INORGANIC')).toEqual({organic_kg:0,inorganic_kg:1,total_kg:1,source:'MANUAL'});
  });
});
