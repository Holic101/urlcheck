import type { Target } from "./config.ts";

export type Verdict = "pass" | "warn" | "fail";

// What one HTTP probe observed. `status` is null when no response arrived.
export interface Probe {
  status: number | null;
  latencyMs: number;
  error?: "timeout" | "network";
  errorDetail?: string;
}

export interface Classification {
  verdict: Verdict;
  reason: string;
}

// Pure decision logic, kept apart from the network code so it can be unit-tested:
//   fail - no response (timeout / DNS / connection error) or a status outside expectStatus
//   warn - expected status, but slower than warnMs
//   pass - expected status within warnMs
export function classify(probe: Probe, target: Pick<Target, "warnMs" | "timeoutMs" | "expectStatus">): Classification {
  if (probe.error === "timeout") {
    return { verdict: "fail", reason: `no response within ${target.timeoutMs} ms` };
  }
  if (probe.status === null) {
    return { verdict: "fail", reason: probe.errorDetail ?? "request failed" };
  }

  const [min, max] = target.expectStatus;
  if (probe.status < min || probe.status > max) {
    const expected = min === max ? `${min}` : `${min}-${max}`;
    return { verdict: "fail", reason: `status ${probe.status}, expected ${expected}` };
  }
  if (probe.latencyMs > target.warnMs) {
    return { verdict: "warn", reason: `slow: over ${target.warnMs} ms` };
  }
  return { verdict: "pass", reason: "ok" };
}
