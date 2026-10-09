import assert from "node:assert/strict";
import test from "node:test";
import { hazeBmp, hazePixels } from "../src/haze-dither.ts";
import { haze } from "../src/theme.ts";

// A laptop window. The haze is 70% of the window across, so a smaller picture has steps too narrow
// to tell a dither from plain rounding.
const W = 1280;
const H = 800;
const BLOCK = 16;

/** A small seeded generator, so the dither is the same on every run. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The level of the haze in each channel of every pixel, never rounded, worked out the plain way. */
const exact = (() => {
  const n = Number.parseInt(haze.base.slice(1), 16);
  const base = [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
  const levels = new Float64Array(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let [red, green, blue] = base;
      for (const pool of haze.pools) {
        const dx = (x + 0.5 - pool.at[0] * W) / (pool.size[0] * W);
        const dy = (y + 0.5 - pool.at[1] * H) / (pool.size[1] * H);
        const reach = Math.hypot(dx, dy) / pool.fade;
        if (reach >= 1) continue;
        const lift = pool.alpha * (1 - reach);
        red += lift * (255 - red);
        green += lift * (255 - green);
        blue += lift * (255 - blue);
      }
      levels.set([red, green, blue], (y * W + x) * 3);
    }
  }
  return levels;
})();
const truth = (pixel: number, channel: number) => exact[pixel * 3 + channel] ?? 0;

/** The largest gap, in levels, between the average of any 16 x 16 block and the exact average. */
function largestBlockError(level: (pixel: number, channel: number) => number): number {
  let largest = 0;
  for (let by = 0; by + BLOCK <= H; by += BLOCK) {
    for (let bx = 0; bx + BLOCK <= W; bx += BLOCK) {
      for (let c = 0; c < 3; c++) {
        let drawn = 0;
        let exactly = 0;
        for (let y = by; y < by + BLOCK; y++) {
          for (let x = bx; x < bx + BLOCK; x++) {
            drawn += level(y * W + x, c);
            exactly += truth(y * W + x, c);
          }
        }
        largest = Math.max(largest, Math.abs(drawn - exactly) / (BLOCK * BLOCK));
      }
    }
  }
  return largest;
}

test("every haze pixel is opaque and within a level of the exact value", () => {
  const pixels = hazePixels(W, H, seeded(1));
  assert.equal(pixels.length, W * H * 4);
  let translucent = 0;
  let furthest = 0;
  for (let pixel = 0; pixel < W * H; pixel++) {
    if (pixels[pixel * 4 + 3] !== 255) translucent++;
    for (let c = 0; c < 3; c++)
      furthest = Math.max(furthest, Math.abs((pixels[pixel * 4 + c] ?? 0) - truth(pixel, c)));
  }
  assert.equal(translucent, 0, "some pixels are not opaque");
  assert.ok(furthest <= 1, `a pixel is ${furthest.toFixed(2)} levels from the exact value`);
});

test("the average of any block follows the exact gradient, so it has no steps", () => {
  const pixels = hazePixels(W, H, seeded(2));
  const dithered = largestBlockError((pixel, c) => pixels[pixel * 4 + c] ?? 0);
  assert.ok(
    dithered < 0.15,
    `a block's average is ${dithered.toFixed(3)} levels off the exact gradient`,
  );
  // The check can fail: plain rounding, which is what a CSS gradient does, leaves each band flat,
  // and a block inside one is a good fraction of a level off.
  const plain = largestBlockError((pixel, c) => Math.round(truth(pixel, c)));
  assert.ok(
    plain > 0.2,
    `plain rounding is only ${plain.toFixed(3)} levels off, so this proves little`,
  );
});

test("the dither does not move the overall tone, and it is grey", () => {
  const pixels = hazePixels(W, H, seeded(3));
  let drawn = 0;
  let exactly = 0;
  let crossed = 0;
  for (let pixel = 0; pixel < W * H; pixel++) {
    const red = pixels[pixel * 4] ?? 0;
    const green = pixels[pixel * 4 + 1] ?? 0;
    const blue = pixels[pixel * 4 + 2] ?? 0;
    drawn += red;
    exactly += truth(pixel, 0);
    // The same noise goes to every channel, so the channels keep their order and never cross.
    if (green < red || blue < green) crossed++;
  }
  assert.equal(crossed, 0, "the dither tinted some pixels");
  assert.ok(
    Math.abs(drawn - exactly) / (W * H) < 0.02,
    "the haze is lighter or darker than it should be",
  );
});

test("where the haze has not reached, every pixel is exactly the base colour", () => {
  const pixels = hazePixels(W, H, seeded(4));
  const n = Number.parseInt(haze.base.slice(1), 16);
  const base = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  let flat = 0;
  let wrong = 0;
  for (let pixel = 0; pixel < W * H; pixel++) {
    if (![0, 1, 2].every((c) => truth(pixel, c) === base[c])) continue;
    flat++;
    if (![0, 1, 2].every((c) => pixels[pixel * 4 + c] === base[c])) wrong++;
  }
  assert.ok(flat > (W * H) / 10, "the pools cover the whole window, so this proves little");
  assert.equal(wrong, 0, "the dither moved a flat part of the backdrop off its colour");
});

test("the BMP of the haze is a 24-bit picture of the same pixels", () => {
  // 37 pixels are 111 bytes, so every row carries a byte of padding.
  const w = 37;
  const h = 23;
  const rowBytes = 112;
  const pixels = hazePixels(w, h, seeded(5));
  const bmp = hazeBmp(w, h, seeded(5));
  const view = new DataView(bmp.buffer);
  assert.equal(String.fromCharCode(bmp[0] ?? 0, bmp[1] ?? 0), "BM");
  assert.equal(bmp.length, 54 + rowBytes * h);
  assert.equal(view.getUint32(2, true), bmp.length, "the file size is wrong");
  assert.equal(view.getUint32(10, true), 54, "the pixels do not start after the headers");
  assert.equal(view.getInt32(18, true), w);
  assert.equal(view.getInt32(22, true), h);
  assert.equal(view.getUint16(28, true), 24);
  assert.equal(view.getUint32(30, true), 0, "the pixels are compressed");
  let wrong = 0;
  let unpadded = 0;
  for (let y = 0; y < h; y++) {
    // The rows are stored bottom to top, in blue, green, red order.
    const row = 54 + (h - 1 - y) * rowBytes;
    for (let x = 0; x < w; x++) {
      const px = (y * w + x) * 4;
      if (
        bmp[row + x * 3] !== pixels[px + 2] ||
        bmp[row + x * 3 + 1] !== pixels[px + 1] ||
        bmp[row + x * 3 + 2] !== pixels[px]
      )
        wrong++;
    }
    if (bmp[row + w * 3] !== 0) unpadded++;
  }
  assert.equal(wrong, 0, "some pixels are not the haze's");
  assert.equal(unpadded, 0, "a row's padding is not zero");
});

test("the CSS gradients the web falls back to and native draws describe the same pools", () => {
  const layers = [
    ...haze.css.matchAll(
      /radial-gradient\(([\d.]+)% ([\d.]+)% at ([\d.]+)% ([\d.]+)%, rgba\(255,255,255,([\d.]+)\), rgba\(255,255,255,0\) ([\d.]+)%\)/g,
    ),
  ].map((m) => m.slice(1).map(Number));
  assert.deepEqual(
    layers,
    haze.pools.map((p) => [
      p.size[0] * 100,
      p.size[1] * 100,
      p.at[0] * 100,
      p.at[1] * 100,
      p.alpha,
      p.fade * 100,
    ]),
  );
});
