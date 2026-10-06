/**
 * Files in a channel's workspace: what the agent makes there and what people upload to it. The
 * server lists, serves and stores them; every client shows them the same way, by `kind`.
 */

/** How a file is shown, and so which preview a client picks for it. */
export type FileKind =
  | "image"
  | "pdf"
  | "video"
  | "audio"
  | "markdown"
  | "html"
  | "csv"
  | "json"
  | "code"
  | "text"
  | "archive"
  | "other";

export interface FileType {
  mimeType: string;
  kind: FileKind;
}

const image = (subtype: string): FileType => ({ mimeType: `image/${subtype}`, kind: "image" });
const video = (subtype: string): FileType => ({ mimeType: `video/${subtype}`, kind: "video" });
const audio = (subtype: string): FileType => ({ mimeType: `audio/${subtype}`, kind: "audio" });
const archive = (mimeType: string): FileType => ({ mimeType, kind: "archive" });
const other = (mimeType: string): FileType => ({ mimeType, kind: "other" });
/** Source and configuration files are shown as text, whatever their language. */
const code = (mimeType = "text/plain"): FileType => ({ mimeType, kind: "code" });
const office = (subtype: string) =>
  other(`application/vnd.openxmlformats-officedocument.${subtype}`);

/** What each known extension is. Source files are sent as plain text so a browser never runs them. */
const types: Readonly<Record<string, FileType>> = {
  ".png": image("png"),
  ".jpg": image("jpeg"),
  ".jpeg": image("jpeg"),
  ".gif": image("gif"),
  ".webp": image("webp"),
  ".avif": image("avif"),
  ".bmp": image("bmp"),
  ".ico": image("x-icon"),
  ".svg": image("svg+xml"),
  ".pdf": { mimeType: "application/pdf", kind: "pdf" },
  ".mp4": video("mp4"),
  ".m4v": video("x-m4v"),
  ".webm": video("webm"),
  ".mov": video("quicktime"),
  ".mp3": audio("mpeg"),
  ".wav": audio("wav"),
  ".m4a": audio("mp4"),
  ".aac": audio("aac"),
  ".ogg": audio("ogg"),
  ".oga": audio("ogg"),
  ".flac": audio("flac"),
  ".md": { mimeType: "text/markdown", kind: "markdown" },
  ".markdown": { mimeType: "text/markdown", kind: "markdown" },
  ".html": { mimeType: "text/html", kind: "html" },
  ".htm": { mimeType: "text/html", kind: "html" },
  ".csv": { mimeType: "text/csv", kind: "csv" },
  ".tsv": { mimeType: "text/tab-separated-values", kind: "csv" },
  ".json": { mimeType: "application/json", kind: "json" },
  ".map": { mimeType: "application/json", kind: "code" },
  ".txt": { mimeType: "text/plain", kind: "text" },
  ".text": { mimeType: "text/plain", kind: "text" },
  ".log": { mimeType: "text/plain", kind: "text" },
  // A page and the scripts and styles beside it must keep their own types, or a browser refuses them.
  ".js": code("text/javascript"),
  ".mjs": code("text/javascript"),
  ".cjs": code("text/javascript"),
  ".css": code("text/css"),
  ".ts": code(),
  ".tsx": code(),
  ".jsx": code(),
  ".py": code(),
  ".rb": code(),
  ".go": code(),
  ".rs": code(),
  ".java": code(),
  ".kt": code(),
  ".swift": code(),
  ".c": code(),
  ".h": code(),
  ".cpp": code(),
  ".hpp": code(),
  ".cs": code(),
  ".php": code(),
  ".sh": code(),
  ".bash": code(),
  ".zsh": code(),
  ".sql": code(),
  ".yml": code(),
  ".yaml": code(),
  ".toml": code(),
  ".ini": code(),
  ".xml": code(),
  ".scss": code(),
  ".less": code(),
  ".vue": code(),
  ".svelte": code(),
  ".graphql": code(),
  ".lua": code(),
  ".r": code(),
  ".dart": code(),
  ".zip": archive("application/zip"),
  ".gz": archive("application/gzip"),
  ".tgz": archive("application/gzip"),
  ".tar": archive("application/x-tar"),
  ".7z": archive("application/x-7z-compressed"),
  ".rar": archive("application/vnd.rar"),
  ".docx": office("wordprocessingml.document"),
  ".xlsx": office("spreadsheetml.sheet"),
  ".pptx": office("presentationml.presentation"),
  ".doc": other("application/msword"),
  ".xls": other("application/vnd.ms-excel"),
  ".ppt": other("application/vnd.ms-powerpoint"),
  ".woff": other("font/woff"),
  ".woff2": other("font/woff2"),
  ".ttf": other("font/ttf"),
  ".otf": other("font/otf"),
  ".wasm": other("application/wasm"),
  ".webmanifest": other("application/manifest+json"),
};

const unknown: FileType = other("application/octet-stream");

/** The type of a file, from its name alone. Anything unrecognised is a download. */
export function describeFile(name: string): FileType {
  const dot = name.lastIndexOf(".");
  return (dot > 0 ? types[name.slice(dot).toLowerCase()] : undefined) ?? unknown;
}

/** Kinds that show their text. A client can read them from a link, so a card can excerpt them. */
export const textKinds: ReadonlySet<FileKind> = new Set([
  "markdown",
  "html",
  "csv",
  "json",
  "code",
  "text",
]);

/** A file or folder in a channel's workspace. */
export interface ChannelFile {
  name: string;
  /** Relative to the channel's workspace, `/`-separated, no leading slash. */
  path: string;
  type: "file" | "folder";
  /** Bytes; 0 for a folder. */
  size: number;
  modifiedAt: string;
  /** Files only. */
  mimeType?: string;
  /** Files only. */
  kind?: FileKind;
  /** A time-limited link to the file's bytes, for the person's browser. Files only. */
  url?: string;
  /** The start of a text file, so a card can show something without downloading it. */
  excerpt?: string;
}

/** One folder of a channel's workspace, or its most recently changed files. */
export interface ChannelFolder {
  channelId: string;
  /** The folder listed; empty is the top of the channel's workspace. */
  path: string;
  entries: ChannelFile[];
  /** True when the folder holds more than `channelFileLimits.listEntries`. */
  truncated: boolean;
}

export const channelFileLimits = {
  /** The largest file a person can add. */
  uploadBytes: 10 * 1024 * 1024,
  /** The largest text file an agent can write while sharing it. */
  writeBytes: 1024 * 1024,
  /** Entries in one folder listing. */
  listEntries: 500,
  /** Files in the recent list unless asked for fewer. */
  recentFiles: 30,
  /** Characters of a text file kept as its excerpt. */
  excerptChars: 1200,
  /** How much of a text file a viewer reads before it says the rest is cut off. */
  textViewBytes: 256 * 1024,
} as const;

/** Where a person's uploads go in a channel's workspace unless they pick a folder. */
export const uploadsFolder = "uploads";
