import {
  type ChannelFile,
  type SentFile,
  sentFileSchema,
  type UploadRequest,
  unrequestedUploadSchema,
  unsentFileSchema,
  uploadRequestSchema,
} from "../../../packages/domain/src/workspace-files";
import { fileSize, fileType } from "./file-format";

/** A tool result as the chat holds it: the object, or the JSON text it was sent as. */
function resultValue(result: unknown): unknown {
  if (typeof result !== "string") return result;
  try {
    return JSON.parse(result);
  } catch {
    return undefined;
  }
}

/** What `send_file` returned: a file that was shared, or the reason it was not. Null if it is neither. */
export function parseSharedFile(result: unknown): SentFile | { error: string } | null {
  const value = resultValue(result);
  const sent = sentFileSchema.safeParse(value);
  if (sent.success) return sent.data;
  const unsent = unsentFileSchema.safeParse(value);
  return unsent.success ? { error: unsent.data.error } : null;
}

/** What `request_upload` returned: the request, or the reason it could not be made. Null if neither. */
export function parseUploadRequest(result: unknown): UploadRequest | { error: string } | null {
  const value = resultValue(result);
  const request = uploadRequestSchema.safeParse(value);
  if (request.success) return request.data;
  const refused = unrequestedUploadSchema.safeParse(value);
  return refused.success ? { error: refused.data.error } : null;
}

/** What the person says to the agent once the files are in: where they are, so it can read them. */
export function uploadMessage(
  files: readonly Pick<ChannelFile, "path" | "name" | "kind" | "size">[],
): string {
  return [
    `@hive I've uploaded ${files.length === 1 ? "the file" : "the files"} you asked for:`,
    ...files.map((file) => `- ${file.path} (${fileType(file)}, ${fileSize(file.size)})`),
  ].join("\n");
}
