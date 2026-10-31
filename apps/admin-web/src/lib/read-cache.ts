function clone<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

/** Bounded, tenant/session-scoped memory only. Never persists school data. */
export class ReadCache {
  private values = new Map<
    string,
    { value: unknown; expires: number; bytes: number }
  >();
  private pending = new Map<string, Promise<unknown>>();
  private generation = 0;
  constructor(
    private ttl = 15_000,
    private limit = 40,
    private now = () => Date.now(),
  ) {}
  clear() {
    this.generation++;
    this.values.clear();
    this.pending.clear();
  }
  async read<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.values.get(key);
    if (hit && hit.expires > this.now()) {
      this.values.delete(key);
      this.values.set(key, hit);
      return clone(hit.value as T);
    }
    if (hit) this.values.delete(key);
    const existing = this.pending.get(key);
    if (existing) return clone((await existing) as T);
    const version = this.generation;
    const work = load().then((value) => {
      if (version === this.generation) {
        const bytes = JSON.stringify(value)?.length * 2 || 0;
        if (bytes <= 2_000_000) {
          this.values.set(key, {
            value: clone(value),
            expires: this.now() + this.ttl,
            bytes,
          });
          while (
            this.values.size > this.limit ||
            [...this.values.values()].reduce(
              (sum, item) => sum + item.bytes,
              0,
            ) > 8_000_000
          )
            this.values.delete(this.values.keys().next().value!);
        }
      }
      return value;
    });
    this.pending.set(key, work);
    try {
      return clone(await work);
    } finally {
      if (this.pending.get(key) === work) this.pending.delete(key);
    }
  }
}
export const cacheableRead = (path: string) =>
  /^\/(students|classes|academic-years|cards|devices|extracurriculars|led\/content|led\/gateways)(\?|\/summary(?:\?|$)|$)/.test(
    path,
  ) && !path.includes("token");
