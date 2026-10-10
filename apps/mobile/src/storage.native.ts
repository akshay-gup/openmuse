import * as SecureStore from "expo-secure-store";
import type { KeyValueStore } from "./storage-types";

// The keychain (iOS) and keystore (Android) take keys of letters, digits and . - _ only.
const name = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, "_");

export const storage: KeyValueStore = {
  get: (key) => SecureStore.getItemAsync(name(key)).catch(() => null),
  set: (key, value) => SecureStore.setItemAsync(name(key), value).catch(() => {}),
  remove: (key) => SecureStore.deleteItemAsync(name(key)).catch(() => {}),
};
