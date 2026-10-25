#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { validateReport, worksheetReportState } from "./report-validation.mjs";

export { validateReport } from "./report-validation.mjs";

export async function checkReport(file) {
  const text = await readFile(file, "utf8");
  const state = worksheetReportState(text);
  const errors = state.kind ? state.errors : validateReport(text);
  if (errors.length) throw new Error(errors.join("\n"));
  for (const warning of state.warnings ?? []) console.warn(`WARNING: ${warning}`);
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const file = process.argv[2];
  if (!file) throw new Error("Usage: node check-report.mjs <report.md>");
  try { await checkReport(file); console.log("Report structure check passed."); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
