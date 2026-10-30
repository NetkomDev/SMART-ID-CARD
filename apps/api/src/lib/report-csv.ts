export function csv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]!);
  const quote = (value: unknown) => {
    let text = String(value ?? "");
    if (typeof value === "string" && /^[\s]*[=+@-]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return [keys.map(quote).join(","), ...rows.map(row => keys.map(k => quote(row[k])).join(","))].join("\r\n");
}
