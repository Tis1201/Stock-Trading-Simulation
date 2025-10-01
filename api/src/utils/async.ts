// src/common/utils/async.ts
export const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

export async function retry<T>(
  fn: () => Promise<T>,
  attempts = 3,
  backoffMs = 600,
  isRetryable?: (err: unknown) => boolean,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (isRetryable && !isRetryable(e)) break;
      if (i < attempts - 1) await sleep(backoffMs * (i + 1));
    }
  }
  throw lastErr;
}
