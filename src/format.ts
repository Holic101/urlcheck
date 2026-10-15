import type { Verdict } from "./classify.ts";
import type { Result } from "./check.ts";

const COLORS: Record<Verdict, string> = { pass: "\x1b[32m", warn: "\x1b[33m", fail: "\x1b[31m" };
const RESET = "\x1b[0m";
const DIM = "\x1b[2m";

export function formatLine(r: Result, nameWidth: number, color: boolean): string {
  const label = r.verdict.toUpperCase().padEnd(6);
  const verdict = color ? `${COLORS[r.verdict]}${label}${RESET}` : label;
  const status = (r.status === null ? "---" : String(r.status)).padStart(4);
  const latency = `${r.latencyMs} ms`.padStart(8);
  const reason = color ? `${DIM}${r.reason}${RESET}` : r.reason;
  return `${verdict}  ${status}  ${latency}  ${r.target.name.padEnd(nameWidth)}  ${reason}`;
}

export function formatReport(results: Result[], color: boolean): string {
  const nameWidth = Math.max(4, ...results.map((r) => r.target.name.length));
  const header = `RESULT  CODE  ${"LATENCY".padStart(8)}  ${"NAME".padEnd(nameWidth)}  DETAIL`;
  const counts = { pass: 0, warn: 0, fail: 0 };
  for (const r of results) counts[r.verdict]++;
  const summary = `${results.length} checked: ${counts.pass} pass, ${counts.warn} warn, ${counts.fail} fail`;
  return [header, ...results.map((r) => formatLine(r, nameWidth, color)), "", summary].join("\n");
}
