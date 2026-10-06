import assert from "node:assert/strict";
import { test } from "node:test";
import { fileSize, parseTable, prettyJson } from "../src/file-format.ts";

test("sizes are said in whole kilobytes, then in megabytes", () => {
  assert.equal(fileSize(0), "1 KB");
  assert.equal(fileSize(1), "1 KB");
  assert.equal(fileSize(1536), "2 KB");
  assert.equal(fileSize(1024 * 1024 - 1), "1024 KB");
  assert.equal(fileSize(1024 * 1024), "1.0 MB");
  assert.equal(fileSize(2.5 * 1024 * 1024), "2.5 MB");
});

test("JSON is laid out for reading, and anything else is left alone", () => {
  assert.equal(
    prettyJson('{"a":[1,2],"b":{"c":null}}'),
    '{\n  "a": [\n    1,\n    2\n  ],\n  "b": {\n    "c": null\n  }\n}',
  );
  assert.equal(prettyJson('{"a": '), '{"a": ');
  assert.equal(prettyJson(""), "");
});

test("a CSV is read into rows of cells", () => {
  assert.deepEqual(parseTable("name,qty\nbolts,12\nnuts,40\n").rows, [
    ["name", "qty"],
    ["bolts", "12"],
    ["nuts", "40"],
  ]);
  // No final line break, Windows line breaks, a byte order mark and a blank last line.
  assert.deepEqual(parseTable("﻿a,b\r\n1,2").rows, [
    ["a", "b"],
    ["1", "2"],
  ]);
  assert.deepEqual(parseTable("a,b\r\n\r\n").rows, [["a", "b"], [""]]);
  assert.deepEqual(parseTable("").rows, []);
  assert.deepEqual(parseTable("a,,c,").rows, [["a", "", "c", ""]]);
});

test("quoted cells can hold commas, quotes and line breaks", () => {
  assert.deepEqual(
    parseTable('title,note\n"Hello, world","She said ""hi"""\n"two\nlines",x').rows,
    [
      ["title", "note"],
      ["Hello, world", 'She said "hi"'],
      ["two\nlines", "x"],
    ],
  );
  // A quote in the middle of a cell is just a character; an unfinished quote reads to the end.
  assert.deepEqual(parseTable('5" pipe,"open').rows, [['5" pipe', "open"]]);
});

test("a TSV is read with tabs, and a big file is cut where the limits say", () => {
  assert.deepEqual(parseTable("a\tb\n1\t2", "\t").rows, [
    ["a", "b"],
    ["1", "2"],
  ]);
  const big = Array.from({ length: 500 }, (_, i) => `${i},${"x,".repeat(40)}end`).join("\n");
  const table = parseTable(big, ",", { rows: 10, columns: 5 });
  assert.equal(table.rows.length, 10);
  assert.equal(table.rows[9][0], "9");
  assert.equal(table.rows[0].length, 5);
  assert.equal(table.moreRows, true);
  assert.equal(table.moreColumns, true);
  const small = parseTable("a,b\n1,2", ",", { rows: 10, columns: 5 });
  assert.equal(small.moreRows, false);
  assert.equal(small.moreColumns, false);
  // Exactly at the limit is not "more".
  assert.equal(parseTable("a\nb\nc", ",", { rows: 3, columns: 5 }).moreRows, false);
  assert.equal(parseTable("a\nb\nc\nd", ",", { rows: 3, columns: 5 }).moreRows, true);
});
