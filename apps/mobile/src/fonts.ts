import { Platform } from "react-native";
import { fontCss, preloadedFonts } from "./font-files";

/**
 * Registers Poppins on the web build and makes it the font of every Text (see font-files.ts for
 * how). Imported once, for its effect, from index.js. Native builds keep the system font, so this
 * does nothing there.
 */
if (Platform.OS === "web" && typeof document !== "undefined" && !document.getElementById("fonts")) {
  const style = document.createElement("style");
  style.id = "fonts";
  style.textContent = fontCss();
  document.head.appendChild(style);
  for (const href of preloadedFonts) {
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "font";
    link.type = "font/woff2";
    link.crossOrigin = "anonymous";
    link.href = href;
    document.head.appendChild(link);
  }
}
