import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classify } from "../src/classify.ts";
import { checkAll } from "../src/check.ts";
import { parseConfig, type StatusRange } from "../src/config.ts";

const target = { warnMs: 1000, timeoutMs: 5000, expectStatus: [200, 399] as StatusRange };

describe("classify", () => {
  it("passes an expected status within warnMs", () => {
    assert.deepEqual(classify({ status: 200, latencyMs: 120 }, target), { verdict: "pass", reason: "ok" });
  });

  it("treats latency exactly at warnMs as pass (threshold is exclusive)", () => {
    assert.equal(classify({ status: 200, latencyMs: 1000 }, target).verdict, "pass");
    assert.equal(classify({ status: 200, latencyMs: 1001 }, target).verdict, "warn");
  });

  it("warns on an expected status that is slow", () => {
    assert.deepEqual(classify({ status: 301, latencyMs: 2500 }, target), { verdict: "warn", reason: "slow: over 1000 ms" });
  });

  it("fails on a status outside the expected range, even if fast", () => {
    assert.deepEqual(classify({ status: 404, latencyMs: 50 }, target), { verdict: "fail", reason: "status 404, expected 200-399" });
    assert.equal(classify({ status: 503, latencyMs: 50 }, target).verdict, "fail");
  });

  it("honours a custom expected status", () => {
    const only204 = { ...target, expectStatus: [204, 204] as StatusRange };
    assert.equal(classify({ status: 204, latencyMs: 10 }, only204).verdict, "pass");
    assert.deepEqual(classify({ status: 200, latencyMs: 10 }, only204).reason, "status 200, expected 204");
  });

  it("fails on timeout and on network errors", () => {
    assert.deepEqual(classify({ status: null, latencyMs: 5000, error: "timeout" }, target), {
      verdict: "fail",
      reason: "no response within 5000 ms",
    });
    assert.deepEqual(classify({ status: null, latencyMs: 30, error: "network", errorDetail: "DNS lookup failed" }, target), {
      verdict: "fail",
      reason: "DNS lookup failed",
    });
  });
});

describe("checkAll (with a fake fetch)", () => {
  it("probes every target and classifies the result", async () => {
    const targets = parseConfig(JSON.stringify({ urls: ["https://up.test", "https://missing.test", "https://down.test"] }));
    const fakeFetch = (async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("down")) throw new TypeError("fetch failed", { cause: { code: "ENOTFOUND" } });
      return new Response("body", { status: u.includes("missing") ? 404 : 200 });
    }) as typeof fetch;

    const results = await checkAll(targets, fakeFetch);
    assert.deepEqual(
      results.map((r) => [r.target.name, r.status, r.verdict, r.reason]),
      [
        ["https://up.test/", 200, "pass", "ok"],
        ["https://missing.test/", 404, "fail", "status 404, expected 200-399"],
        ["https://down.test/", null, "fail", "DNS lookup failed"],
      ],
    );
  });

  it("maps an abort-timeout to a timeout failure", async () => {
    const [t] = parseConfig(JSON.stringify({ urls: [{ url: "https://slow.test", timeoutMs: 50, warnMs: 10 }] }));
    const hangingFetch = ((_url: unknown, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
      })) as typeof fetch;

    const [r] = await checkAll([t], hangingFetch);
    assert.equal(r.verdict, "fail");
    assert.equal(r.error, "timeout");
    assert.equal(r.reason, "no response within 50 ms");
  });
});
