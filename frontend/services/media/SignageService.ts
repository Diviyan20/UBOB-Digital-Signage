import { api } from "@/frontend/components/api/client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { downloadSignageFile } from "./MediaDownload";
import { ensureSignageDir } from "./MediaStorage";

const SIGNAGE_META_KEY = "signage_meta";

// What we store in AsyncStorage — just the list of files currently on disk
export interface SignageMeta {
  items: SignageItem[];
  fetchedAt: number;
}

export interface SignageItem {
  key: string; // S3 key — stable identifier
  url: string; // CloudFront URL
  rotate: boolean; // whether to rotate 90° for portrait
  localUri: string; // local file:// path — what the player uses
}

// ─── Cache helpers ─────────────────────────────────────────────────────────────

const loadMeta = async (): Promise<SignageMeta | null> => {
  try {
    const raw = await AsyncStorage.getItem(SIGNAGE_META_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const saveMeta = async (items: SignageItem[]): Promise<void> => {
  const meta: SignageMeta = { items, fetchedAt: Date.now() };
  await AsyncStorage.setItem(SIGNAGE_META_KEY, JSON.stringify(meta));
};

// ─── Main fetch ───────────────────────────────────────────────────────────────

/**
 * Fetch signage media from Odoo (via backend), download to device, return local URIs.
 *
 * Every call fetches the latest list from the server.
 * Files already on disk are skipped (no re-download).
 * Files no longer in the latest list are deleted from disk.
 * No etag or version check — caller controls how often this runs.
 */
export const fetchSignageMedia = async (): Promise<SignageItem[]> => {
  console.log("[SIGNAGE] Fetching latest media from server...");

  // Step 1: Get latest list from backend (which fetches from Odoo)
  let serverItems: { key: string; url: string }[] = [];

  try {
    const response = await fetch(api.signageVideos);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    serverItems = data.videos || [];
  } catch (err) {
    console.error("[SIGNAGE] Server fetch failed:", err);

    // Offline — return whatever is cached on disk
    const meta = await loadMeta();
    if (meta && meta.items.length > 0) {
      console.log(
        `[SIGNAGE] Offline — serving ${meta.items.length} cached items`,
      );
      return meta.items;
    }
    return [];
  }

  if (serverItems.length === 0) {
    console.warn("[SIGNAGE] Server returned no media");
    return [];
  }

  ensureSignageDir();

  // Step 2: Download any new files (skip existing)
  const results = await Promise.allSettled(
    serverItems.map(async (item) => {
      const localUri = await downloadSignageFile(item.url, item.key);
      return { key: item.key, url: item.url, localUri } as SignageItem;
    }),
  );

  const successful = results
    .filter(
      (r): r is PromiseFulfilledResult<SignageItem> => r.status === "fulfilled",
    )
    .map((r) => r.value);

  // Step 3: Delete files that are no longer in the server list
  const currentKeys = new Set(serverItems.map((i) => i.key));
  const meta = await loadMeta();

  if (meta) {
    for (const old of meta.items) {
      if (!currentKeys.has(old.key)) {
        try {
          const { File } = await import("expo-file-system/next");
          const file = new File(old.localUri);
          if (file.exists) {
            file.delete();
            console.log(`[SIGNAGE] Deleted stale file: ${old.key}`);
          }
        } catch (err) {
          console.warn(
            `[SIGNAGE] Failed to delete stale file: ${old.key}`,
            err,
          );
        }
      }
    }
  }

  // Step 4: Save updated meta
  await saveMeta(successful);
  console.log(`[SIGNAGE] Ready — ${successful.length} items on disk`);

  return successful;
};

/**
 * Load cached signage items without hitting the server.
 * Used on app boot before the first refresh fires.
 */
export const getCachedSignageMedia = async (): Promise<SignageItem[]> => {
  const meta = await loadMeta();
  if (!meta || meta.items.length === 0) return [];
  console.log(`[SIGNAGE] Loaded ${meta.items.length} cached items from disk`);
  return meta.items;
};
