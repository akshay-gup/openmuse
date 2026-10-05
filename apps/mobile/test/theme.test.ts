import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { colors, textPairs } from "../src/theme.ts";

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number) => {
    const c = ((n >> shift) & 255) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
}
function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

test("every text and background pair in the theme stays readable (WCAG AA, 4.5:1)", () => {
  for (const [foreground, background] of textPairs) {
    const ratio = contrast(colors[foreground], colors[background]);
    assert.ok(
      ratio >= 4.5,
      `${foreground} on ${background} is ${ratio.toFixed(2)}:1 (${colors[foreground]} on ${colors[background]})`,
    );
  }
});

test("colours are written only in src/theme.ts", () => {
  const root = new URL("..", import.meta.url).pathname;
  const sources = [
    join(root, "App.tsx"),
    ...readdirSync(join(root, "src"))
      .filter((name) => /\.tsx?$/.test(name) && name !== "theme.ts")
      .map((name) => join(root, "src", name)),
  ];
  const offenders: string[] = [];
  for (const file of sources) {
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, index) => {
        const code = line.replace(/\s\/\/.*$/, "");
        if (/#[0-9a-fA-F]{3,8}\b|\brgba?\(/.test(code))
          offenders.push(`${file.replace(root, "")}:${index + 1}  ${line.trim()}`);
      });
  }
  assert.deepEqual(
    offenders,
    [],
    `Use a token from src/theme.ts instead of a colour value:\n${offenders.join("\n")}`,
  );
});
