// src/common/utils/concurrency.ts
export class Concurrency {
  constructor(private readonly size: number) {}

  async map<T, R>(
    items: T[],
    worker: (item: T, idx: number) => Promise<R>
  ): Promise<R[]> {
    if (!Array.isArray(items) || items.length === 0) return [];

    const results = new Array<R>(items.length);
    let cursor = 0;

    const runner = async () => {
      while (true) {
        const idx = cursor++;
        if (idx >= items.length) break;
        results[idx] = await worker(items[idx], idx);
      }
    };

    const pool = Math.max(1, Math.min(this.size || 1, items.length));
    await Promise.all(Array.from({ length: pool }, runner));
    return results;
  }
}

// (giữ lại helper cũ nếu bạn muốn dùng nơi khác)
export async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (!Array.isArray(items) || items.length === 0) return;
  const pool = Math.max(1, Math.min(concurrency || 1, items.length));

  let cursor = 0;
  const runners = Array.from({ length: pool }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) break;
      await worker(items[idx], idx);
    }
  });

  await Promise.all(runners);
}
