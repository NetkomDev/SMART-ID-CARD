import { describe, expect, it } from "vitest";
import { csv } from "./report-csv.js";
describe("spreadsheet exports", () => {
  it("escapes quotes/newlines and prevents formula execution without changing numeric negatives", () => {
    const result = csv([{ name: '=HYPERLINK("bad")', kg: -2, notes: 'baris\n"dua"' }]);
    expect(result).toContain(`"'=HYPERLINK(""bad"")"`);
    expect(result).toContain('"-2"'); expect(result).toContain('baris\n""dua""');
  });
});
