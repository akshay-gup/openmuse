import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fontCss, fontFiles, fontSubsets, fontWeights, preloadedFonts } from "../src/font-files.ts";
import { fontFamily } from "../src/theme.ts";

const publicDir = new URL("../public", import.meta.url).pathname;

test("every Poppins file the stylesheet asks for ships in public/fonts", () => {
  const missing = fontFiles.filter((url) => !existsSync(join(publicDir, url)));
  assert.deepEqual(missing, [], `Missing from apps/mobile/public: ${missing.join(", ")}`);
});

test("public/fonts holds only the files the app uses, and the licence", () => {
  const shipped = readdirSync(join(publicDir, "fonts")).sort();
  const expected = [...fontFiles.map((url) => url.replace("/fonts/", "")), "OFL.txt"].sort();
  assert.deepEqual(shipped, expected);
});

test("the stylesheet registers each weight and subset once", () => {
  const faces = fontCss().match(/@font-face/g) ?? [];
  assert.equal(faces.length, fontWeights.length * Object.keys(fontSubsets).length);
});

test("Poppins is the font of every Text except code", () => {
  assert.ok(fontFamily.web.startsWith('"Poppins"'));
  assert.ok(
    fontCss().includes(`html [dir="auto"]:not([data-mono]){font-family:${fontFamily.web}}`),
  );
});

test("the faces preloaded on first paint are real files", () => {
  for (const url of preloadedFonts) assert.ok(fontFiles.includes(url), url);
});
