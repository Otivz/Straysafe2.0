// Generated from src/core/report-validation.mjs by scripts/build-skill.mjs.
// Run `npm run build` after changing the canonical source.

const allowedStatuses = Object.freeze({
  security: new Set(["Pass", "Fail", "Unverified", "N/A"]),
  engineering: new Set(["Applied", "Partial", "Recommended", "Unverified", "N/A"]),
  documentation: new Set(["Pass", "Fail", "Unverified", "N/A"]),
  generic: new Set(["Pass", "Fail", "Unverified", "N/A", "Applied", "Partial", "Recommended"])
});

const requiredColumns = Object.freeze({
  security: ["control id", "priority", "evidence mode", "status", "evidence", "remediation", "owner", "verification"],
  engineering: ["practice id", "status", "evidence", "impact", "recommendation", "owner", "verification"]
});

const placeholders = /^(?:|_|-+|none|not verified|unassigned|file\/line(?:, command output, or approved observation|, metric, trace, or test output))$/i;
const evidenceModes = new Set(["Passive", "Passive first", "Authorized active", "External", "Mixed"]);

function columnIndex(header, name) {
  const exact = header.indexOf(name);
  return exact >= 0 ? exact : header.findIndex((cell) => cell.includes(name));
}

function splitRow(line) {
  const cells = [];
  let cell = "";
  for (let index = 1; index < line.length - 1; index += 1) {
    if (line[index] === "|" && line[index - 1] !== "\\") {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += line[index];
    }
  }
  cells.push(cell.trim());
  return cells;
}

function reportTables(text) {
  const tables = [];
  let header;
  let kind = "generic";
  const lines = text.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (!line.startsWith("|")) {
      header = undefined;
      continue;
    }
    if (/^\|[-: |]+\|$/.test(line)) continue;
    const cells = splitRow(line);
    if (/^\|[-: |]+\|$/.test(lines[index + 1] ?? "")) {
      header = cells.map((cell) => cell.toLowerCase());
      if (!header.includes("status")) {
        header = undefined;
        continue;
      }
      kind = header.includes("control id") ? "security" : header.includes("practice id") ? "engineering" : "generic";
      tables.push({ header, kind, rows: [] });
      continue;
    }
    if (header) tables.at(-1).rows.push({ line: index + 1, cells });
  }
  return tables;
}

export function validateReport(text) {
  const errors = [];
  const tables = reportTables(text);
  if (!tables.length) return ["No findings table with a Status column was found."];

  for (const table of tables) {
    const allowed = allowedStatuses[table.kind] ?? allowedStatuses.generic;
    const required = requiredColumns[table.kind] ?? ["status"];
    for (const column of required) {
      if (!table.header.includes(column)) errors.push(`Findings table is missing required '${column}' column.`);
    }
    if (!table.rows.length) errors.push(`The ${table.kind} findings table has no findings.`);
    const statusIndex = table.header.indexOf("status");
    const idIndex = table.header.findIndex((cell) => cell === "control id" || cell === "practice id");
    const evidenceModeIndex = table.header.indexOf("evidence mode");
    const seenIds = new Set();
    for (const row of table.rows) {
      if (row.cells.length !== table.header.length) {
        errors.push(`Line ${row.line}: expected ${table.header.length} cells; found ${row.cells.length}.`);
      }
      const status = row.cells[statusIndex];
      if (!status) {
        errors.push(`Line ${row.line}: status is empty.`);
        continue;
      }
      if (!allowed.has(status)) {
        errors.push(`Line ${row.line}: invalid status '${status}'.`);
        continue;
      }
      const id = row.cells[idIndex] ?? "";
      if (table.kind === "security" && !/^SEC-\d{2}-\d{2}$/.test(id)) {
        errors.push(`Line ${row.line}: finding requires a valid SEC-NN-NN control ID.`);
      }
      if (table.kind === "engineering" && !/^ENG-\d{2}-\d{2}$/.test(id)) {
        errors.push(`Line ${row.line}: finding requires a valid ENG-NN-NN practice ID.`);
      }
      if (id && seenIds.has(id)) errors.push(`Line ${row.line}: duplicate finding ID '${id}'.`);
      if (id) seenIds.add(id);
      if (table.kind === "security" && evidenceModeIndex >= 0 && !evidenceModes.has(row.cells[evidenceModeIndex])) {
        errors.push(`Line ${row.line}: invalid evidence mode '${row.cells[evidenceModeIndex] ?? ""}'.`);
      }
      if (status !== "Unverified" && status !== "N/A") {
        const requiredEvidence = ["evidence", "owner", "verification"];
        if (table.kind === "security" && status === "Fail") requiredEvidence.push("remediation");
        if (table.kind === "engineering" && ["Partial", "Recommended"].includes(status)) requiredEvidence.push("impact", "recommendation");
        for (const name of requiredEvidence) {
          const column = columnIndex(table.header, name);
          if (column < 0 || placeholders.test(row.cells[column] ?? "")) errors.push(`Line ${row.line}: status '${status}' requires ${name}.`);
        }
      }
      if (status === "N/A") {
        const evidenceColumn = columnIndex(table.header, "evidence");
        if (evidenceColumn < 0 || placeholders.test(row.cells[evidenceColumn] ?? "")) errors.push(`Line ${row.line}: status 'N/A' requires an evidence rationale.`);
      }
    }
  }
  return errors;
}

function expectedOverall(kind, statuses) {
  if (!statuses.length) return undefined;
  if (kind === "security") {
    if (statuses.includes("Fail")) return "Fail";
    if (statuses.includes("Unverified")) return "Unverified";
    if (statuses.includes("Pass")) return "Pass";
    return "N/A";
  }
  if (kind === "engineering") {
    if (statuses.includes("Unverified")) return "Unverified";
    const substantive = new Set(statuses.filter((status) => status !== "N/A"));
    if (!substantive.size) return "N/A";
    if (substantive.size === 1 && substantive.has("Applied")) return "Applied";
    if (substantive.size === 1 && substantive.has("Recommended")) return "Recommended";
    return "Partial";
  }
}

export function worksheetReportState(text) {
  const tables = reportTables(text);
  const typedTables = tables.filter((table) => table.kind !== "generic");
  const kinds = new Set(typedTables.map((table) => table.kind));
  const kind = kinds.size === 1 ? [...kinds][0] : undefined;
  const errors = validateReport(text);
  const warnings = [];
  if (!kind) errors.push("Worksheet must contain one security or engineering findings table.");
  else if (typedTables.length !== 1) errors.push("Worksheet must contain exactly one security or engineering findings table.");

  const overall = text.match(/^- Overall status:\s*(.*?)\s*$/mi)?.[1];
  if (!overall) errors.push("Worksheet is missing an Overall status field.");
  else if (kind && !allowedStatuses[kind].has(overall)) errors.push(`Invalid overall status '${overall}' for a ${kind} worksheet.`);

  const statuses = typedTables.flatMap((table) => {
    const statusIndex = table.header.indexOf("status");
    return table.rows.map((row) => row.cells[statusIndex]).filter(Boolean);
  });
  if (kind) {
    const prefix = kind === "security" ? "SEC" : "ENG";
    const referenceChecklist = text.split(/^## Reference checklist\s*$/mi)[1] ?? "";
    const referenced = new Set(referenceChecklist.match(new RegExp(`\\b${prefix}-\\d{2}-\\d{2}\\b`, "g")) ?? []);
    const findings = new Set(typedTables.flatMap((table) => {
      const idIndex = table.header.findIndex((cell) => cell === "control id" || cell === "practice id");
      return table.rows.map((row) => row.cells[idIndex]).filter(Boolean);
    }));
    const expectedLine = text.match(/^- Expected finding IDs:\s*(.*?)\s*$/mi);
    const listed = expectedLine?.[1].match(/\b(?:SEC|ENG)-\d{2}-\d{2}\b/g) ?? [];
    const expectedIds = expectedLine ? new Set(listed) : referenced;
    if (!expectedLine) {
      warnings.push("Legacy worksheet: Expected finding IDs metadata is missing. Validation fell back to the editable Reference checklist and cannot fully verify completeness.");
    } else {
      if (!listed.length) errors.push("Expected finding IDs metadata does not contain any stable IDs.");
      if (listed.length !== expectedIds.size) errors.push("Expected finding IDs metadata contains duplicate IDs.");
      for (const id of expectedIds) {
        if (!id.startsWith(`${prefix}-`)) errors.push(`Expected finding ID '${id}' does not match the ${kind} worksheet type.`);
      }
    }
    for (const id of expectedIds) {
      if (!findings.has(id)) errors.push(`Expected item '${id}' is missing from the findings table.`);
      if (!referenced.has(id)) errors.push(`Expected item '${id}' is missing from the Reference checklist.`);
    }
    if (expectedLine) {
      for (const id of findings) if (!expectedIds.has(id)) errors.push(`Finding item '${id}' is not declared in Expected finding IDs metadata.`);
      for (const id of referenced) if (!expectedIds.has(id)) errors.push(`Reference item '${id}' is not declared in Expected finding IDs metadata.`);
    }
  }
  const expected = kind ? expectedOverall(kind, statuses) : undefined;
  if (overall && expected && overall !== expected) errors.push(`Overall status '${overall}' conflicts with finding statuses; expected '${expected}'.`);
  const open = overall === "Unverified" || statuses.includes("Unverified");
  return { kind, overall, statuses, open, warnings: [...new Set(warnings)], errors: [...new Set(errors)] };
}
