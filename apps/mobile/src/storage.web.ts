import type { KeyValueStore } from "./storage-types";

// A browser may refuse storage (a private window, blocked site data), and the app works without it.
export const storage: KeyValueStore = {
  async get(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  async set(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Nothing is kept; the person signs in again next time.
    }
  },
  async remove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Nothing was kept to remove.
    }
  },
};
