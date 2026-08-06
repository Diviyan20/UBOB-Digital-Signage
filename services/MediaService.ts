import { api } from "@/components/api/client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, File, Paths } from "expo-file-system/next";

export interface VideoItem {
  videoURI: string;
  rotate?: boolean;
  sizeMb?: number;
  optimized?: boolean;
}

export interface PlaylistItems {
  key: string;
  type: "video" | "image";
  url: string;
  localUri: string;
  rotate?: boolean;
}

const VIDEO_CACHE_KEY = "signage_videos_cache";
const PLAYLIST_META_KEY = "playlist_meta";
const CACHE_TTL_MS = 23 * 60 * 60 * 1000;

interface VideoCache {
  etag: string;
  videos: VideoItem[];
  cachedAt: number;
  outletId: string;
}

interface PlaylistMeta {
  etag: string;
  outletId: string;
  batchNumber: string;
  tier: string;
  orientation: string;
  items: PlaylistMetaItem[];
}

interface PlaylistMetaItem {
  key: string;
  type: "video" | "image";
  url: string;
  localUri: string;
  rotate?: boolean;
}

export interface ManifestItem {
  key: string;
  url: string;
}

export interface PlaylistVersionResult {
  etag: string | null;
  itemCount: number;
  manifest: ManifestItem[];
}

export interface SignageVersion {
  etag: string | null;
  itemCount: number;
}

export const sanitizeVideoUrl = (url?: string): string => {
  return (url || "").trim().replace(/\\+$/g, "").replace(/\s+$/g, "");
};

// ─── File system helpers ──────────────────────────────────────────────────────

// Playlist directory inside app's document directory
const getPlaylistDir = (): Directory => {
  return new Directory(Paths.document, "playlist");
};

const ensurePlaylistDir = (): void => {
  const dir = getPlaylistDir();
  if (!dir.exists) {
    dir.create();
    console.log("[FS] Created playlist directory");
  }
};

const keyToFilename = (key: string): string => {
  const parts = key.split("/");
  const filename = parts[parts.length - 1];
  return filename.replace(/\s+/g, "-");
};

const getLocalFile = (key: string): File => {
  const dir = getPlaylistDir();
  return new File(dir, keyToFilename(key));
};

/**
 * Downloads a single file to local storage.
 * Skips download if the file already exists on disk.
 */
const downloadFile = async (key: string, url: string): Promise<string> => {
  const dir = getPlaylistDir();
  const filename = keyToFilename(key);

  // Check if file already exists
  const existing = new File(dir, filename);
  if (existing.exists) {
    console.log(`[FS] Already exists, skipping: ${filename}`);
    return existing.uri;
  }

  console.log(`[FS] Downloading: ${filename}`);

  // File.downloadFileAsync(url, destination) — static method, destination is a Directory
  // Returns the downloaded File instance with its uri
  const downloaded = await File.downloadFileAsync(url, dir);

  return downloaded.uri;
};

/**
 * Deletes all files in the playlist directory and recreates it.
 * Called when etag changes — full redownload.
 */
const clearPlaylistFiles = (): void => {
  const dir = getPlaylistDir();
  if (dir.exists) {
    dir.delete();
    console.log("[FS] Playlist directory cleared");
  }
  dir.create();
};

// ─── Version helpers ──────────────────────────────────────────────────────────

export const getSignageVersion = async (): Promise<SignageVersion> => {
  try {
    const response = await fetch(api.signageVersion);
    const data = await response.json();
    if (!response.ok) return { etag: null, itemCount: 0 };
    return { etag: data.etag ?? null, itemCount: data.itemCount ?? 0 };
  } catch {
    return { etag: null, itemCount: 0 };
  }
};

export const getPlaylistVersion = async (
  outletId: string,
  batchNumber: string,
  tier: string,
  orientation: string,
): Promise<PlaylistVersionResult> => {
  const response = await fetch(api.playlistVersion, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      outlet_id: outletId,
      batch_number: batchNumber,
      tier,
      orientation,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.warn("[VERSION ERROR]", data?.message);
    return { etag: null, itemCount: 0, manifest: [] };
  }

  console.log(`[VERSION] etag=${data.etag} items=${data.itemCount}`);
  return {
    etag: data.etag ?? null,
    itemCount: data.itemCount ?? 0,
    manifest: data.manifest ?? [],
  };
};

export const clearVideoCache = async (): Promise<void> => {
  await AsyncStorage.removeItem(VIDEO_CACHE_KEY);
  console.log("[CACHE] Signage video cache cleared");
};

export const clearPlaylistCache = async (): Promise<void> => {
  await AsyncStorage.removeItem(PLAYLIST_META_KEY);
  clearPlaylistFiles();
  console.log("[CACHE] Playlist cache cleared");
};

// ─── Main playlist fetch with local download ──────────────────────────────────

export const fetchPlaylist = async (): Promise<PlaylistItems[]> => {
  const outletId = await AsyncStorage.getItem("outlet_id");
  const batchNumber = (await AsyncStorage.getItem("batch_number")) || "1";
  const orientation =
    (await AsyncStorage.getItem("orientation")) || "Landscape";
  const tier = (await AsyncStorage.getItem("tier")) || "Tier A";

  if (!outletId) {
    console.warn("[FETCH] No outlet_id in AsyncStorage");
    return [];
  }

  console.log(
    `[PLAYLIST] Outlet: ${outletId} | Batch: ${batchNumber} | Tier: ${tier} | Orientation: ${orientation}`,
  );

  ensurePlaylistDir();

  // Step 1: Load cached meta
  let cachedMeta: PlaylistMeta | null = null;
  try {
    const raw = await AsyncStorage.getItem(PLAYLIST_META_KEY);
    if (raw) {
      const parsed: PlaylistMeta = JSON.parse(raw);
      const sameContext =
        parsed.outletId === outletId &&
        parsed.batchNumber === batchNumber &&
        parsed.tier === tier &&
        parsed.orientation === orientation;

      if (sameContext) cachedMeta = parsed;
    }
  } catch {
    console.warn("[CACHE] Failed to read playlist meta");
  }

  // Step 2: Fetch etag + manifest (lightweight metadata only)
  let serverEtag: string | null = null;
  let manifest: ManifestItem[] = [];

  try {
    const version = await getPlaylistVersion(
      outletId,
      batchNumber,
      tier,
      orientation,
    );
    serverEtag = version.etag;
    manifest = version.manifest;
  } catch {
    console.warn("[PLAYLIST] Version check failed — offline, using cache");
  }

  // Step 3: No server response — return cache immediately (offline)
  if (!serverEtag && cachedMeta && cachedMeta.items.length > 0) {
    console.log(
      `[OFFLINE] No server response — serving ${cachedMeta.items.length} cached items`,
    );
    return cachedMeta.items.map((item) => ({
      key: item.key,
      type: item.type,
      url: item.url,
      localUri: item.localUri,
      rotate: item.rotate,
    }));
  }

  // Step 3b: Online and etag matches — return cache, nothing to download
  if (
    serverEtag &&
    cachedMeta &&
    cachedMeta.etag === serverEtag &&
    cachedMeta.items.length > 0
  ) {
    const firstFile = new File(cachedMeta.items[0].localUri);
    if (firstFile.exists) {
      console.log(
        `[CACHE HIT] etag unchanged — serving ${cachedMeta.items.length} cached items`,
      );
      return cachedMeta.items.map((item) => ({
        key: item.key,
        type: item.type,
        url: item.url,
        localUri: item.localUri,
        rotate: item.rotate,
      }));
    }
    console.warn("[CACHE] etag matches but files missing — redownloading");
  }

  // Step 4: Etag differs — clear and redownload
  if (cachedMeta && cachedMeta.etag !== serverEtag) {
    console.log(
      `[SYNC] Content changed: ${cachedMeta.etag} → ${serverEtag} — clearing`,
    );
    clearPlaylistFiles();
  } else {
    // Truly no cache at all
    console.log(`[SYNC] No cache — downloading ${manifest.length} item(s)`);
    ensurePlaylistDir();
  }

  if (manifest.length === 0) {
    console.warn("[SYNC] Empty manifest — nothing to download");
    return [];
  }

  // Step 5: Fetch type metadata (video vs image) from /playlist
  let typeMap: Record<string, { type: "video" | "image"; rotate?: boolean }> =
    {};
  try {
    const response = await fetch(api.playlist, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        outlet_id: outletId,
        batch_number: parseInt(batchNumber),
        tier,
        orientation,
      }),
    });
    const data = await response.json();
    const items: PlaylistItems[] = data.playlist || [];
    typeMap = Object.fromEntries(
      items.map((item) => [item.key, { type: item.type, rotate: item.rotate }]),
    );
  } catch (err) {
    console.error("[FETCH ERROR] Could not fetch playlist metadata:", err);
    return [];
  }

  // Step 6: Download all files in parallel
  console.log(`[SYNC] Downloading ${manifest.length} item(s)...`);

  const downloadResults = await Promise.allSettled(
    manifest.map(async (item) => {
      const localUri = await downloadFile(item.key, item.url);
      const meta = typeMap[item.key] ?? { type: "video" as const };
      return {
        key: item.key,
        type: meta.type,
        url: item.url,
        localUri,
        rotate: meta.rotate,
      } as PlaylistItems;
    }),
  );

  const successful = downloadResults
    .filter(
      (r): r is PromiseFulfilledResult<PlaylistItems> =>
        r.status === "fulfilled",
    )
    .map((r) => r.value);

  const failed = downloadResults.filter((r) => r.status === "rejected").length;
  if (failed > 0) console.warn(`[SYNC] ${failed} file(s) failed to download`);

  console.log(
    `[SYNC] Downloaded ${successful.length}/${manifest.length} item(s)`,
  );

  // Step 7: Save meta to AsyncStorage
  const newMeta: PlaylistMeta = {
    etag: serverEtag || "",
    outletId,
    batchNumber,
    tier,
    orientation,
    items: successful.map((item) => ({
      key: item.key,
      type: item.type,
      url: item.url,
      localUri: item.localUri,
      rotate: item.rotate,
    })),
  };

  await AsyncStorage.setItem(PLAYLIST_META_KEY, JSON.stringify(newMeta));
  console.log(
    `[CACHE] Playlist meta saved — ${successful.length} items, etag: ${serverEtag}`,
  );

  return successful;
};

// ─── Signage videos ───────────────────────────────────────────────────────────

export const fetchSignageVideos = async (): Promise<VideoItem[]> => {
  const outletId = await AsyncStorage.getItem("outlet_id");
  if (!outletId) {
    console.warn("[FETCH] No outlet_id in AsyncStorage");
    return [];
  }

  const { etag: serverEtag } = await getSignageVersion();
  console.log(
    "[SIGNAGE STARTUP CHECK]",
    JSON.stringify({ outletId, serverEtag }),
  );

  try {
    const cachedRaw = await AsyncStorage.getItem(VIDEO_CACHE_KEY);
    if (cachedRaw) {
      const cache: VideoCache = JSON.parse(cachedRaw);
      const sameOutlet = cache.outletId === outletId;
      const etagMatch = serverEtag && cache.etag === serverEtag;
      const notExpired = Date.now() - cache.cachedAt < CACHE_TTL_MS;

      if (sameOutlet && (etagMatch || (!serverEtag && notExpired))) {
        console.log(
          `[CACHE HIT] Signage videos — etag: ${cache.etag}, ${cache.videos.length} videos`,
        );
        return cache.videos;
      }
      console.log(
        `[CACHE STALE] Signage — cached: ${cache.etag}, server: ${serverEtag}`,
      );
    } else {
      console.log("[CACHE MISS] No signage video cache");
    }
  } catch {
    console.warn("[CACHE] Failed to read signage cache");
  }

  console.log("[FETCH] Fetching fresh signage videos...");
  try {
    const response = await fetch(api.signageVideos, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    const data = await response.json();
    if (!response.ok)
      throw new Error(data?.message || "Failed to fetch videos");

    const videos: VideoItem[] = data?.videos || [];
    const cleanedVideos = videos
      .map((v) => ({ ...v, videoURI: sanitizeVideoUrl(v.videoURI) }))
      .filter((v) => v.videoURI.startsWith("https://"));

    const cachePayload: VideoCache = {
      etag: serverEtag || "",
      videos: cleanedVideos,
      cachedAt: Date.now(),
      outletId,
    };
    await AsyncStorage.setItem(VIDEO_CACHE_KEY, JSON.stringify(cachePayload));
    console.log(
      `[CACHE] Signage videos cached — ${cleanedVideos.length} videos, etag: ${serverEtag}`,
    );
    return cleanedVideos;
  } catch (err) {
    console.error("[FETCH ERROR] Signage videos:", err);
    return [];
  }
};
