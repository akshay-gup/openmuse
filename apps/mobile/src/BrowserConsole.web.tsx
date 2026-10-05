import { colors, radius } from "./ui";
export default function BrowserConsole({ url }: { url: string }) {
  return (
    <iframe
      title="Remote browser session console"
      src={url}
      style={{
        height: 540,
        width: "100%",
        border: 0,
        borderRadius: radius.lg,
        background: colors.surface,
      }}
    />
  );
}
