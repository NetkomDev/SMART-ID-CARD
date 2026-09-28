import { afterEach, describe, expect, it, vi } from 'vitest';
import { SerialCardAdapter } from './hardware.js';

afterEach(() => vi.unstubAllGlobals());

function station(reply: (request: Record<string, string>) => object | null) {
  let incoming!: ReadableStreamDefaultController<Uint8Array>;
  const commands: Record<string, string>[] = [];
  const readable = new ReadableStream<Uint8Array>({ start(controller) { incoming = controller; } });
  const port = {
    open: vi.fn(async () => {}), close: vi.fn(async () => {}), readable,
    writable: new WritableStream<Uint8Array>({ write(bytes) {
      const request = JSON.parse(new TextDecoder().decode(bytes)); commands.push(request);
      const result = reply(request);
      if (result) incoming.enqueue(new TextEncoder().encode(JSON.stringify({ id: request.id, ...result }) + '\n'));
    } })
  };
  vi.stubGlobal('navigator', { serial: { requestPort: async () => port } });
  return { adapter: new SerialCardAdapter(), commands, port, disconnect: () => incoming.close() };
}

describe('physical serial station contract', () => {
  it('sends the expected UID to firmware and reads actual returned memory', async () => {
    const s = station(r => r.command === 'READ_CARD' ? { ok: true, uid: '04AABBCCDD', payload: 'different-physical-memory' } : { ok: true });
    await s.adapter.connect(); await s.adapter.connect();
    await s.adapter.write('AKS1:' + 'a'.repeat(48), '04AABBCCDD');
    expect(s.commands[0]).toMatchObject({ command: 'WRITE_CARD', expected_uid: '04AABBCCDD' });
    expect(await s.adapter.read()).toEqual({ uid: '04AABBCCDD', payload: 'different-physical-memory' });
    expect(s.port.open).toHaveBeenCalledTimes(1); s.disconnect();
  });
  it('rejects malformed success and invalid chip identity', async () => {
    const s = station(r => r.command === 'WRITE_CARD' ? { ok: 'true' } : { ok: true, uid: 'invalid', payload: '' });
    await s.adapter.connect();
    await expect(s.adapter.write('payload', '04AABBCCDD')).rejects.toThrow('HARDWARE_IO_FAILED');
    await expect(s.adapter.read()).rejects.toThrow('READ_CARD'); s.disconnect();
  });
  it('rejects outstanding reads when the physical connection ends', async () => {
    const s = station(() => null); await s.adapter.connect();
    const read = s.adapter.read(); const rejection = expect(read).rejects.toThrow('Station terputus');
    s.disconnect(); await rejection;
  });
});
