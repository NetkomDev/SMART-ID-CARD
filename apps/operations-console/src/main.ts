import "./style.css";
import { OperatorSession } from "../../shared/operator-session";
import { csv } from "../../api/src/lib/report-csv";
const session = new OperatorSession("aksis.operations");
const container = document.querySelector("#reports")!, message = document.querySelector("#message")!;
async function start() {
  await session.open();
  for (const domain of ["attendance", "waste", "library", "extracurricular"]) {
    const button = document.createElement("button"); button.textContent = `Unduh ${domain}.csv`;
    button.onclick = async () => {
      button.disabled = true; message.textContent = "Menyiapkan snapshot…";
      try {
        const manifest = await session.request<{ id: string; row_count: number; checksum: string }>("/reports/exports", { method: "POST", body: JSON.stringify({ domain }) });
        const rows: Record<string, unknown>[] = [];
        let offset: number | null = 0;
        while (offset !== null) {
          const page: { rows: Record<string, unknown>[]; next_offset: number | null } = await session.request(`/reports/exports/${manifest.id}?offset=${offset}&limit=500`);
          rows.push(...page.rows); offset = page.next_offset;
          message.textContent = `Mengunduh ${rows.length}/${manifest.row_count} baris…`;
        }
        if (rows.length !== manifest.row_count) throw Error("Jumlah baris tidak cocok; ekspor dibatalkan.");
        const url = URL.createObjectURL(new Blob(["\uFEFF" + csv(rows)], { type: "text/csv;charset=utf-8" }));
        const link = document.createElement("a"); link.href = url; link.download = `${domain}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        message.textContent = `Selesai: ${rows.length} baris. Snapshot ${manifest.id}; SHA-256 ${manifest.checksum}.`;
      } catch (error) { message.textContent = error instanceof Error ? error.message : "Ekspor gagal."; }
      finally { button.disabled = false; }
    };
    container.append(button);
  }
}
void start();
