import { useEffect, useRef } from "react";
import { hazePixels } from "./haze-dither";

/** The most pixels the backdrop is worked out for. A 5K screen would take 15 million, and a canvas scales up smoothly. */
const MOST_PIXELS = 8_000_000;
/** How long a window has to stop resizing before the haze is worked out again for its new size. */
const SETTLE_MS = 150;

/**
 * The backdrop haze, drawn once on a canvas with one pixel of it for each pixel of the screen. A CSS
 * gradient is rounded to whole levels without any dither, so one this slow and this dark shows as
 * rings; here every pixel is rounded with noise first (src/haze-dither.ts), so it does not.
 *
 * It fills the view it sits in, over the CSS gradient that view draws as a fallback until this is
 * ready. A resize leaves the old picture stretched until the window settles, which a haze this soft
 * can afford.
 */
export function HazeCanvas() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    let drawn = "";
    let timer: ReturnType<typeof setTimeout> | undefined;

    const draw = () => {
      const box = element.getBoundingClientRect();
      const scale = Math.min(
        window.devicePixelRatio || 1,
        Math.sqrt(MOST_PIXELS / Math.max(1, box.width * box.height)),
      );
      const width = Math.max(1, Math.round(box.width * scale));
      const height = Math.max(1, Math.round(box.height * scale));
      if (`${width}x${height}` === drawn) return;
      const context = element.getContext("2d");
      if (!context) return;
      element.width = width;
      element.height = height;
      context.putImageData(new ImageData(hazePixels(width, height), width, height), 0, 0);
      drawn = `${width}x${height}`;
    };

    draw();
    // Its first report is for the size it already has, which `draw` sees is done.
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(draw, SETTLE_MS);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, []);

  return (
    <canvas
      ref={canvas}
      style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
    />
  );
}
