#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { ConfigError, parseConfig } from "./config.ts";
import { checkAll } from "./check.ts";
import { formatReport } from "./format.ts";

const USAGE = `Usage: urlcheck [--config <file>] [--json] [--no-color]

  -c, --config <file>  URL list (default: urls.json)
      --json           print results as JSON instead of a table
      --no-color       disable ANSI colours (honours NO_COLOR; FORCE_COLOR forces them on)
  -h, --help           show this help

Exit codes: 0 all pass/warn, 1 at least one fail, 2 bad config or usage.`;

async function main(): Promise<number> {
  let values;
  try {
    ({ values } = parseArgs({
      options: {
        config: { type: "string", short: "c", default: "urls.json" },
        json: { type: "boolean", default: false },
        "no-color": { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    }));
  } catch (err) {
    console.error(`${(err as Error).message}\n\n${USAGE}`);
    return 2;
  }
  if (values.help) {
    console.log(USAGE);
    return 0;
  }

  let targets;
  try {
    targets = parseConfig(await readFile(values.config, "utf8"));
  } catch (err) {
    const msg = err instanceof ConfigError ? err.message : `cannot read ${values.config}: ${(err as Error).message}`;
    console.error(`urlcheck: ${msg}`);
    return 2;
  }

  const results = await checkAll(targets);

  if (values.json) {
    console.log(JSON.stringify(results.map(({ target, ...r }) => ({ name: target.name, url: target.url, ...r })), null, 2));
  } else {
    const color =
      !values["no-color"] && !process.env.NO_COLOR && (Boolean(process.env.FORCE_COLOR) || process.stdout.isTTY);
    console.log(formatReport(results, color));
  }
  return results.some((r) => r.verdict === "fail") ? 1 : 0;
}

process.exitCode = await main();
