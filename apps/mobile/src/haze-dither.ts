import { haze } from "./theme";

/** A six-digit hex colour as its red, green and blue levels. */
function levelsOf(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * The backdrop haze as RGBA pixels, `width` by `height`, with its steps dithered away.
 *
 * A screen shows 256 levels per channel, and the haze rises about 24 of them over some 800 pixels,
 * so drawn plainly (a CSS gradient does) each level is a flat band and the bands show as rings.
 * Grain laid over the finished bands only masks them: the average still steps. Here each pixel's
 * exact value is worked out in floating point and rounded with up to half a level of noise added
 * first, so the rounding errors do not line up and the average follows the true gradient. One noise
 * value goes to all three channels, which keeps the dither grey. `random` is `Math.random` unless a
 * test wants the same noise every time.
 */
export function hazePixels(
  width: number,
  height: number,
  random: () => number = Math.random,
): Uint8ClampedArray<ArrayBuffer> {
  const [baseRed, baseGreen, baseBlue] = levelsOf(haze.base);
  const pools = haze.pools.map((pool) => ({
    x: pool.at[0] * width,
    y: pool.at[1] * height,
    scaleX: 1 / (pool.size[0] * width),
    scaleY: 1 / (pool.size[1] * height),
    alpha: pool.alpha,
    fade: pool.fade,
    fadeSquared: pool.fade * pool.fade,
  }));
  const pixels = new Uint8ClampedArray(width * height * 4);
  const rowOffset = new Float64Array(pools.length);
  let at = 0;
  for (let y = 0; y < height; y++) {
    for (let p = 0; p < pools.length; p++) {
      const pool = pools[p];
      if (!pool) continue;
      const dy = (y + 0.5 - pool.y) * pool.scaleY;
      rowOffset[p] = dy * dy;
    }
    for (let x = 0; x < width; x++, at += 4) {
      let red = baseRed;
      let green = baseGreen;
      let blue = baseBlue;
      let lit = false;
      for (let p = 0; p < pools.length; p++) {
        const pool = pools[p];
        if (!pool) continue;
        const dx = (x + 0.5 - pool.x) * pool.scaleX;
        const reachSquared = dx * dx + (rowOffset[p] ?? 0);
        if (reachSquared >= pool.fadeSquared) continue;
        lit = true;
        const lift = pool.alpha * (1 - Math.sqrt(reachSquared) / pool.fade);
        red += lift * (255 - red);
        green += lift * (255 - green);
        blue += lift * (255 - blue);
      }
      // Noise cannot move a flat colour (half a level of it still rounds back), so it is only
      // drawn where a pool has lifted the colour off its level.
      const noise = lit ? random() - 0.5 : 0;
      // A Uint8ClampedArray rounds to the nearest level when it stores a number.
      pixels[at] = red + noise;
      pixels[at + 1] = green + noise;
      pixels[at + 2] = blue + noise;
      pixels[at + 3] = 255;
    }
  }
  return pixels;
}
