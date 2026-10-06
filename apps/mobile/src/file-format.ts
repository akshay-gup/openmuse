/** How big a file is, as a person would say it. */
export const fileSize = (bytes: number): string =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

/** A JSON file laid out for reading. Text that is not valid JSON (yet) is left as it is. */
export function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

export interface Table {
  rows: string[][];
  /** The file has more rows than were read. */
  moreRows: boolean;
  /** Some row has more columns than were kept. */
  moreColumns: boolean;
}

/**
 * The first rows of a CSV or TSV file. A quoted cell can hold the delimiter, line breaks and `""`
 * for a quote, as spreadsheets write them. Reading stops once the limits are passed, so a big file
 * costs no more than a small one.
 */
export function parseTable(
  text: string,
  delimiter = ",",
  limits: { rows: number; columns: number } = { rows: 100, columns: 12 },
): Table {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let moreColumns = false;
  const endCell = () => {
    if (row.length < limits.columns) row.push(cell);
    else moreColumns = true;
    cell = "";
  };
  const endRow = () => {
    endCell();
    rows.push(row);
    row = [];
  };
  const source = text.startsWith("﻿") ? text.slice(1) : text;
  for (let i = 0; i < source.length && rows.length <= limits.rows; i++) {
    const char = source[i];
    if (quoted) {
      if (char !== '"') cell += char;
      else if (source[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = false;
    } else if (char === '"' && cell === "") quoted = true;
    else if (char === delimiter) endCell();
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i++;
      endRow();
    } else cell += char;
  }
  // A file that does not end with a line break still has its last row.
  if (rows.length <= limits.rows && (cell !== "" || row.length)) endRow();
  const moreRows = rows.length > limits.rows;
  return { rows: moreRows ? rows.slice(0, limits.rows) : rows, moreRows, moreColumns };
}
