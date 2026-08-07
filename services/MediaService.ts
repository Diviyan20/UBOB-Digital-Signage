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
const PLAYLIST_ETAG_KEY = "playlist_etag"; // stored separately for fast reads
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

const downloadFile = async (key: string, url: string): Promise<string> => {
  const dir = getPlaylistDir();
  const filename = keyToFilename(key);

  const existing = new File(dir, filename);
  if (existing.exists) {
    console.log(`[FS] Already exists, skipping: ${filename}`);
    return existing.uri;
  }

  console.log(`[FS] Downloading: ${filename}`);
  const downloaded = await File.downloadFileAsync(url, dir);
  console.log(`[FS] Downloaded: ${filename}`);
  return downloaded.uri;
};

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
  // Let network errors throw — caller handles offline case
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
  await AsyncStorage.multiRemove([PLAYLIST_META_KEY, PLAYLIST_ETAG_KEY]);
  clearPlaylistFiles();
  console.log("[CACHE] Playlist cache cleared");
};

// ─── Cache helpers ────────────────────────────────────────────────────────────

const loadCachedMeta = async (
  outletId: string,
  batchNumber: string,
  tier: string,
  orientation: string,
): Promise<PlaylistMeta | null> => {
  try {
    const raw = await AsyncStorage.getItem(PLAYLIST_META_KEY);
    if (!raw) return null;

    const parsed: PlaylistMeta = JSON.parse(raw);
    const sameContext =
      parsed.outletId === outletId &&
      parsed.batchNumber === batchNumber &&
      parsed.tier === tier &&
      parsed.orientation === orientation;

    return sameContext ? parsed : null;
  } catch {
    console.warn("[CACHE] Failed to read playlist meta");
    return null;
  }
};

const cachedFilesExistOnDisk = (meta: PlaylistMeta): boolean => {
  if (meta.items.length === 0) return false;
  // Check first file — if it exists, assume the rest do too
  const firstFile = new File(meta.items[0].localUri);
  return firstFile.exists;
};

const metaToPlaylistItems = (meta: PlaylistMeta): PlaylistItems[] =>
  meta.items.map((item) => ({
    key: item.key,
    type: item.type,
    url: item.url,
    localUri: item.localUri,
    rotate: item.rotate,
  }));

// ─── Download helpers ─────────────────────────────────────────────────────────

const fetchTypeMap = async (
  outletId: string,
  batchNumber: string,
  tier: string,
  orientation: string,
): Promise<Record<string, { type: "video" | "image"; rotate?: boolean }>> => {
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
  return Object.fromEntries(
    items.map((item) => [item.key, { type: item.type, rotate: item.rotate }]),
  );
};

const downloadManifest = async (
  manifest: ManifestItem[],
  typeMap: Record<string, { type: "video" | "image"; rotate?: boolean }>,
): Promise<PlaylistItems[]> => {
  const results = await Promise.allSettled(
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

  const failed = results.filter((r) => r.status === "rejected").length;
  if (failed > 0) console.warn(`[SYNC] ${failed} file(s) failed to download`);

  return results
    .filter(
      (r): r is PromiseFulfilledResult<PlaylistItems> =>
        r.status === "fulfilled",
    )
    .map((r) => r.value);
};

const savePlaylistMeta = async (
  items: PlaylistItems[],
  etag: string,
  outletId: string,
  batchNumber: string,
  tier: string,
  orientation: string,
): Promise<void> => {
  const meta: PlaylistMeta = {
    etag,
    outletId,
    batchNumber,
    tier,
    orientation,
    items: items.map((item) => ({
      key: item.key,
      type: item.type,
      url: item.url,
      localUri: item.localUri,
      rotate: item.rotate,
    })),
  };

  // Save meta and etag together
  await AsyncStorage.multiSet([
    [PLAYLIST_META_KEY, JSON.stringify(meta)],
    [PLAYLIST_ETAG_KEY, etag],
  ]);

  console.log(
    `[CACHE] Playlist meta saved — ${items.length} items, etag: ${etag}`,
  );
};

// ─── Main playlist fetch ──────────────────────────────────────────────────────

/**
 * Playlist sync flow:
 *
 * 1. Load cache from AsyncStorage
 * 2. If cache exists and files are on disk → return immediately
 * 3. Check etag from server in background
 *    - Offline → already returned cache in step 2, or return empty if no cache
 *    - etag matches → cache is current, already returned
 *    - etag differs → clear files, redownload, update cache
 * 4. First run (no cache) → download everything
 *
 * Cache is always checked before any network call.
 * etag is stored in AsyncStorage for fast comparison.
 */
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

  // ── Step 1: Load cache ────────────────────────────────────────────────────
  const cachedMeta = await loadCachedMeta(
    outletId,
    batchNumber,
    tier,
    orientation,
  );
  const hasValidCache =
    cachedMeta !== null && cachedFilesExistOnDisk(cachedMeta);

  if (hasValidCache) {
    console.log(
      `[CACHE] Found ${cachedMeta!.items.length} cached items on disk`,
    );
  }

  // ── Step 2: Try to get server etag ───────────────────────────────────────
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
    console.warn("[PLAYLIST] Version check failed — offline");
  }

  // ── Step 3: Offline — serve cache or return empty ─────────────────────────
  if (!serverEtag) {
    if (hasValidCache) {
      console.log(
        `[OFFLINE] Serving ${cachedMeta!.items.length} cached items (no server response)`,
      );
      return metaToPlaylistItems(cachedMeta!);
    }
    console.warn("[OFFLINE] No cache available — cannot serve media");
    return [];
  }

  // ── Step 4: Online — compare etag ────────────────────────────────────────
  const cachedEtag = cachedMeta?.etag ?? null;

  if (serverEtag === cachedEtag && hasValidCache) {
    console.log(
      `[CACHE HIT] etag unchanged (${serverEtag}) — serving ${cachedMeta!.items.length} cached items`,
    );
    return metaToPlaylistItems(cachedMeta!);
  }

  // ── Step 5: etag changed or no cache — redownload ────────────────────────
  if (cachedMeta && cachedEtag !== serverEtag) {
    console.log(
      `[SYNC] etag changed: ${cachedEtag} → ${serverEtag} — clearing files`,
    );
    clearPlaylistFiles();
  } else {
    console.log(`[SYNC] No cache — first download`);
  }

  if (manifest.length === 0) {
    console.warn("[SYNC] Empty manifest — nothing to download");
    return [];
  }

  // ── Step 6: Fetch type metadata and download ──────────────────────────────
  let typeMap: Record<string, { type: "video" | "image"; rotate?: boolean }> =
    {};
  try {
    typeMap = await fetchTypeMap(outletId, batchNumber, tier, orientation);
  } catch (err) {
    console.error("[FETCH ERROR] Could not fetch playlist metadata:", err);
    // Fall back to cache if available — better than showing nothing
    if (hasValidCache) {
      console.warn("[FALLBACK] Using stale cache after metadata fetch failure");
      return metaToPlaylistItems(cachedMeta!);
    }
    return [];
  }

  console.log(`[SYNC] Downloading ${manifest.length} item(s)...`);
  const successful = await downloadManifest(manifest, typeMap);
  console.log(
    `[SYNC] Downloaded ${successful.length}/${manifest.length} item(s)`,
  );

  if (successful.length === 0) {
    console.warn("[SYNC] All downloads failed — falling back to cache");
    return hasValidCache ? metaToPlaylistItems(cachedMeta!) : [];
  }

  // ── Step 7: Save updated meta ─────────────────────────────────────────────
  await savePlaylistMeta(
    successful,
    serverEtag,
    outletId,
    batchNumber,
    tier,
    orientation,
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
