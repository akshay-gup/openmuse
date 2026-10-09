import { useEffect, useRef, useState } from "react";
import { hazeBmp } from "./haze-dither";

/** The most pixels the picture has. A larger screen scales it up, which a haze this soft can afford. */
const MOST_PIXELS = 4_000_000;
/** How long a window has to stop resizing before the haze is worked out again for its new size. */
const SETTLE_MS = 150;

/**
 * The backdrop haze as a picture, made on the spot and shown as a background image. A CSS gradient
 * is rounded to whole levels with next to no dither, so one this slow and this dark shows as rings;
 * here every pixel is rounded with noise first (src/haze-dither.ts), so it does not.
 *
 * It has one pixel for each CSS pixel, and never more than the screen has: a sharper screen scales
 * it up, which leaves each pixel's noise where it was, and a browser that scaled it down would
 * average the noise away. It fills the view it sits in, over the CSS gradient that view draws as a
 * fallback until this is ready. A resize leaves the old picture stretched until the window settles.
 */
export function HazeImage() {
  const box = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    let drawn = "";
    let timer: ReturnType<typeof setTimeout> | undefined;

    const draw = () => {
      const { width: cssWidth, height: cssHeight } = element.getBoundingClientRect();
      const scale = Math.min(
        1,
        window.devicePixelRatio || 1,
        Math.sqrt(MOST_PIXELS / Math.max(1, cssWidth * cssHeight)),
      );
      const width = Math.max(1, Math.round(cssWidth * scale));
      const height = Math.max(1, Math.round(cssHeight * scale));
      if (`${width}x${height}` === drawn) return;
      drawn = `${width}x${height}`;
      setUrl(URL.createObjectURL(new Blob([hazeBmp(width, height)], { type: "image/bmp" })));
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

  // A picture is let go once the next one is showing, and when the haze goes.
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );

  return (
    <div
      ref={box}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        backgroundImage: url ? `url("${url}")` : undefined,
        backgroundSize: "100% 100%",
      }}
    />
  );
}
