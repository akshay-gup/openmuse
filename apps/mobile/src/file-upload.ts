import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import { type ChannelFile, channelFileLimits } from "../../../packages/domain/src/workspace-files";
import { API_URL, type MuseApi } from "./api";
import { fileSize, pickerTypes } from "./file-format";

export interface PickedFile {
  name: string;
  size?: number;
  mimeType?: string;
  uri: string;
  /** On the web, the file itself; native pickers give a `uri` instead. */
  file?: File;
}

/** Let the person choose files, of the kinds in `accept` if given. Resolves to none if they back out. */
export async function pickFiles(
  options: { accept?: readonly string[]; multiple?: boolean } = {},
): Promise<PickedFile[]> {
  const result = await DocumentPicker.getDocumentAsync({
    type: pickerTypes(options.accept, Platform.OS === "web"),
    multiple: options.multiple ?? true,
    copyToCacheDirectory: true,
  });
  if (result.canceled) return [];
  return result.assets.map(({ name, size, mimeType, uri, file }) => ({
    name,
    size,
    mimeType,
    uri,
    file,
  }));
}

/**
 * Add a chosen file to a channel's workspace, in `folder` (the uploads folder unless said). Throws
 * a message the person can read when it cannot be added.
 */
export async function uploadChannelFile(
  api: MuseApi,
  channelId: string,
  picked: PickedFile,
  folder?: string,
): Promise<ChannelFile> {
  if (picked.size !== undefined && picked.size > channelFileLimits.uploadBytes)
    throw new Error(
      `${picked.name} is over ${fileSize(channelFileLimits.uploadBytes)}, which is the most Hive can take.`,
    );
  const path = `/api/agent/channels/${encodeURIComponent(channelId)}/files`;
  if (Platform.OS === "web") {
    if (!picked.file) throw new Error(`${picked.name} could not be read. Please choose it again.`);
    const form = new FormData();
    form.append("file", picked.file, picked.name);
    if (folder) form.append("dir", folder);
    return api.request<ChannelFile>(path, form);
  }
  const upload = await FileSystem.uploadAsync(`${API_URL}${path}`, picked.uri, {
    httpMethod: "POST",
    uploadType: FileSystem.FileSystemUploadType.MULTIPART,
    fieldName: "file",
    mimeType: picked.mimeType ?? "application/octet-stream",
    parameters: folder ? { dir: folder } : undefined,
    headers: { Authorization: `Bearer ${api.token}` },
  });
  let payload: { error?: string } & Partial<ChannelFile> = {};
  try {
    payload = JSON.parse(upload.body);
  } catch {
    // The server answered with something that is not JSON; the status says enough.
  }
  if (upload.status < 200 || upload.status >= 300)
    throw new Error(payload.error || `${picked.name} could not be added.`);
  return payload as ChannelFile;
}
