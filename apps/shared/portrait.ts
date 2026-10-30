/** Untrusted stored URLs never become HTML or CSS source. */
export function safePortraitUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) return value;
  try {
    const url = new URL(value, globalThis.location?.origin ?? "https://aksis.invalid");
    if (url.protocol === "https:" && !url.username && !url.password && !/[<>"'\s]/.test(value)) return url.href;
  } catch { /* Invalid URL */ }
  return null;
}

export function renderPortrait(container: HTMLElement, value: unknown): void {
  container.replaceChildren();
  const url = safePortraitUrl(value);
  if (!url) { container.textContent = "👤"; return; }
  const img = document.createElement("img");
  img.alt = "Foto siswa";
  img.style.cssText = "width:100%;height:100%;object-fit:cover";
  img.referrerPolicy = "no-referrer";
  img.src = url;
  img.onerror = () => { container.replaceChildren(); container.textContent = "👤"; };
  container.append(img);
}
