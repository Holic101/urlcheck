import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ConfigError, DEFAULTS, parseConfig, parseStatus } from "../src/config.ts";

const cfg = (obj: unknown) => JSON.stringify(obj);

describe("parseConfig", () => {
  it("accepts bare URL strings and applies built-in defaults", () => {
    const [t] = parseConfig(cfg({ urls: ["https://example.com"] }));
    assert.deepEqual(t, { name: "https://example.com/", url: "https://example.com/", ...DEFAULTS });
  });

  it("lets file-level defaults override built-ins", () => {
    const [t] = parseConfig(cfg({ defaults: { timeoutMs: 2000, warnMs: 500 }, urls: ["http://a.test"] }));
    assert.equal(t.timeoutMs, 2000);
    assert.equal(t.warnMs, 500);
    assert.deepEqual(t.expectStatus, DEFAULTS.expectStatus);
  });

  it("lets per-entry fields override file-level defaults", () => {
    const [t] = parseConfig(
      cfg({
        defaults: { warnMs: 500 },
        urls: [{ url: "https://api.test/health", name: "API", warnMs: 200, expectStatus: 204 }],
      }),
    );
    assert.equal(t.name, "API");
    assert.equal(t.warnMs, 200);
    assert.deepEqual(t.expectStatus, [204, 204]);
  });

  it("rejects invalid JSON", () => {
    assert.throws(() => parseConfig("{ urls: ["), ConfigError);
  });

  it("rejects a missing or empty urls array", () => {
    assert.throws(() => parseConfig(cfg({})), /"urls" must be a non-empty array/);
    assert.throws(() => parseConfig(cfg({ urls: [] })), /"urls" must be a non-empty array/);
  });

  it("rejects malformed and non-http URLs with the entry index", () => {
    assert.throws(() => parseConfig(cfg({ urls: ["https://ok.test", "not a url"] })), /urls\[1\].*not a valid URL/);
    assert.throws(() => parseConfig(cfg({ urls: ["ftp://files.test"] })), /only http and https/);
  });

  it("rejects non-positive timeouts", () => {
    assert.throws(() => parseConfig(cfg({ urls: [{ url: "https://a.test", timeoutMs: 0 }] })), /timeoutMs/);
    assert.throws(() => parseConfig(cfg({ urls: [{ url: "https://a.test", warnMs: 1.5 }] })), /warnMs/);
  });

  it("rejects warnMs >= timeoutMs, including in defaults", () => {
    assert.throws(() => parseConfig(cfg({ urls: [{ url: "https://a.test", warnMs: 5000 }] })), /must be below timeoutMs/);
    assert.throws(() => parseConfig(cfg({ defaults: { timeoutMs: 100 }, urls: ["https://a.test"] })), /defaults: warnMs/);
  });

  it("rejects duplicate names", () => {
    assert.throws(
      () => parseConfig(cfg({ urls: [{ url: "https://a.test", name: "x" }, { url: "https://b.test", name: "x" }] })),
      /duplicate entry name "x"/,
    );
  });
});

describe("parseStatus", () => {
  it("parses a single code, a range and an Nxx class", () => {
    assert.deepEqual(parseStatus(200, "t"), [200, 200]);
    assert.deepEqual(parseStatus([200, 299], "t"), [200, 299]);
    assert.deepEqual(parseStatus("3xx", "t"), [300, 399]);
  });

  it("rejects out-of-range codes and reversed ranges", () => {
    assert.throws(() => parseStatus(700, "t"), ConfigError);
    assert.throws(() => parseStatus([299, 200], "t"), /reversed/);
    assert.throws(() => parseStatus("6xx", "t"), ConfigError);
  });
});
