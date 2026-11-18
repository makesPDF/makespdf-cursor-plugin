#!/usr/bin/env node

/**
 * CLI entry point for the plugin validator. Run with:
 *
 *   npm run validate
 *   # or
 *   node scripts/validate-plugin.mjs
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { validatePlugin } from "./lib/validate-plugin.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { errors, warnings, checks } = await validatePlugin(root);

for (const check of checks) {
  console.log(`  ok    ${check}`);
}
for (const warning of warnings) {
  console.warn(`  warn  ${warning}`);
}

if (errors.length > 0) {
  console.error(`\nValidation failed with ${errors.length} error(s):`);
  for (const error of errors) {
    console.error(`  fail  ${error}`);
  }
  process.exit(1);
}

console.log(
  `\nValidation passed: ${checks.length} check(s), ${warnings.length} warning(s).`,
);
