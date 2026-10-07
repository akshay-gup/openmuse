import { colors, radius } from "./ui";

/**
 * A web page an agent made, shown in a frame. It has no `allow-same-origin`, so whatever it runs
 * cannot reach Hive's page, its storage or its sign-in: it can only draw itself.
 */
export function HtmlFrame({ url, height }: { url: string; height: number }) {
  return (
    <iframe
      title="Page preview"
      src={url}
      sandbox="allow-scripts allow-forms allow-popups allow-modals"
      referrerPolicy="no-referrer"
      style={{
        height,
        width: "100%",
        border: 0,
        borderRadius: radius.lg,
        background: colors.paper,
      }}
    />
  );
}

/** The browser's own PDF reader, which has the page controls, zoom and print. */
export function PdfFrame({ url, height }: { url: string; height: number }) {
  return (
    <iframe
      title="PDF document"
      src={url}
      style={{
        height,
        width: "100%",
        border: 0,
        borderRadius: radius.lg,
        background: colors.surfaceMuted,
      }}
    />
  );
}

/** Video and audio play where they are, with the browser's controls. */
export function MediaPlayer({
  url,
  kind,
  name,
}: {
  url: string;
  kind: "video" | "audio";
  name: string;
}) {
  return kind === "video" ? (
    // biome-ignore lint/a11y/useMediaCaption: files made by an agent or added by a person have no captions to offer
    <video
      controls
      preload="metadata"
      src={url}
      aria-label={name}
      style={{ width: "100%", maxHeight: 520, borderRadius: radius.lg, background: colors.text }}
    />
  ) : (
    // biome-ignore lint/a11y/useMediaCaption: files made by an agent or added by a person have no captions to offer
    <audio controls preload="metadata" src={url} aria-label={name} style={{ width: "100%" }} />
  );
}
