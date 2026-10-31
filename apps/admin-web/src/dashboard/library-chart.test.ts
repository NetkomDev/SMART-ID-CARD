import { describe, expect, it } from "vitest";
import { renderLibraryChart } from "./library-chart";

describe("bounded library distribution", () => {
  it("accounts for all classes and unclassified visits without SVG callout overflow", () => {
    const rows = [38,29,24,18,12,5].map((value, i) => ({ class_id: String(i), name: `Kelas ${i}`, value, rank: i+1 }));
    const html = renderLibraryChart(rows, 130);
    expect(html).toContain("Kelas lainnya / tanpa kelas");
    expect(html).toContain("130 kunjungan");
    expect(html).not.toContain("polyline");
    expect(html).toContain('viewBox="0 0 160 160"');
  });
  it("keeps zero data honest and escapes class names", () => {
    expect(renderLibraryChart([],0)).toContain("Belum ada kunjungan");
    const html=renderLibraryChart([{class_id:"a",name:'<img src=x onerror="alert(1)">',value:2,rank:1}],2);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});
