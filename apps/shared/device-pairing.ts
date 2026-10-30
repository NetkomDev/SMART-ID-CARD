export function mountDevicePairing(onPaired: (deviceId: string, secret: string) => void) {
  const form = document.createElement("form");
  form.innerHTML = `<label>Kode pairing sekali pakai<input name="token" required minlength="40" maxlength="128" autocomplete="off"></label><button>Hubungkan perangkat</button><p role="status"></p>`;
  document.body.prepend(form);
  form.onsubmit = async event => {
    event.preventDefault();
    const button = form.querySelector("button")!; button.disabled = true;
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL ?? "/api/v1"}/devices/pairing/exchange`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: new FormData(form).get("token") }) });
      const body = await response.json();
      if (!response.ok || !body.success) throw Error(body.error?.message ?? "Pairing gagal.");
      onPaired(body.data.device_id, body.data.secret); form.remove();
    } catch(error) { form.querySelector("p")!.textContent = error instanceof Error ? error.message : "Pairing gagal."; button.disabled = false; }
  };
}
