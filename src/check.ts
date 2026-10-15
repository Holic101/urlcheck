import type { Target } from "./config.ts";
import { classify, type Classification, type Probe } from "./classify.ts";

export interface Result extends Probe, Classification {
  target: Target;
}

// Undici wraps the real reason (ENOTFOUND, ECONNREFUSED, cert errors) in `cause`.
function describeError(err: unknown): string {
  const cause = (err as { cause?: { code?: string; message?: string } }).cause;
  if (cause?.code === "ENOTFOUND" || cause?.code === "EAI_AGAIN") return "DNS lookup failed";
  if (cause?.code) return cause.code;
  return cause?.message ?? (err as Error).message ?? String(err);
}

export async function probe(target: Target, fetchImpl: typeof fetch = fetch): Promise<Probe> {
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);
  try {
    const res = await fetchImpl(target.url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(target.timeoutMs),
      headers: { "user-agent": "urlcheck/1.0" },
    });
    // Latency = time to response headers; drain the body so the socket is released.
    const latencyMs = elapsed();
    await res.body?.cancel();
    return { status: res.status, latencyMs };
  } catch (err) {
    const latencyMs = elapsed();
    if ((err as Error).name === "TimeoutError") return { status: null, latencyMs, error: "timeout" };
    return { status: null, latencyMs, error: "network", errorDetail: describeError(err) };
  }
}

export async function checkAll(targets: Target[], fetchImpl: typeof fetch = fetch): Promise<Result[]> {
  return Promise.all(
    targets.map(async (target) => {
      const p = await probe(target, fetchImpl);
      return { target, ...p, ...classify(p, target) };
    }),
  );
}
