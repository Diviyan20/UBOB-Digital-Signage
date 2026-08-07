import { api } from "@/components/api/client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, File, Paths } from "expo-file-system/next";

export interface VideoItem {
  videoURI: string; // local file:// URI — what the player uses
  cloudFrontURI: string; // original CloudFront URL — kept for reference
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

// Cache keys
const VIDEO_CACHE_KEY = "signage_videos_cache"; // kept for legacy cleanup only
const SIGNAGE_META_KEY = "signage_videos_meta";
const PLAYLIST_META_KEY = "playlist_meta";
const PLAYLIST_ETAG_KEY = "playlist_etag";
const CACHE_TTL_MS = 23 * 60 * 60 * 1000;

// Interfaces
interface SignageMeta {
  etag: string;
  outletId: string;
  items: SignageMetaItem[];
  cachedAt: number;
}

interface SignageMetaItem {
  key: string;
  videoURI: string; // local file:// URI
  cloudFrontURI: string; // original URL
  rotate?: boolean;
  sizeMb?: number;
  optimized?: boolean;
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

// ─── Shared file system helpers ───────────────────────────────────────────────

const keyToFilename = (key: string): string => {
  const parts = key.split("/");
  return parts[parts.length - 1].replace(/\s+/g, "-");
};

// ─── Signage video file system ────────────────────────────────────────────────

const getSignageVideoDir = (): Directory => {
  return new Directory(Paths.document, "signage-videos");
};

const ensureSignageVideoDir = (): void => {
  const dir = getSignageVideoDir();
  if (!dir.exists) {
    dir.create();
    console.log("[FS] Created signage-videos directory");
  }
};

const clearSignageVideoFiles = (): void => {
  const dir = getSignageVideoDir();
  if (dir.exists) {
    dir.delete();
    console.log("[FS] Signage video directory cleared");
  }
  dir.create();
};

const downloadSignageVideo = async (
  key: string,
  url: string,
): Promise<string> => {
  const dir = getSignageVideoDir();
  const filename = keyToFilename(key);

  const existing = new File(dir, filename);
  if (existing.exists) {
    console.log(`[FS] Already exists, skipping: ${filename}`);
    return existing.uri;
  }

  console.log(`[FS] Downloading signage video: ${filename}`);
  const downloaded = await File.downloadFileAsync(url, dir);
  console.log(`[FS] Downloaded: ${filename}`);
  return downloaded.uri;
};

// ─── Playlist file system ─────────────────────────────────────────────────────

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

const clearPlaylistFiles = (): void => {
  const dir = getPlaylistDir();
  if (dir.exists) {
    dir.delete();
    console.log("[FS] Playlist directory cleared");
  }
  dir.create();
};

const downloadPlaylistFile = async (
  key: string,
  url: string,
): Promise<string> => {
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
  await AsyncStorage.multiRemove([VIDEO_CACHE_KEY, SIGNAGE_META_KEY]);
  clearSignageVideoFiles();
  console.log("[CACHE] Signage video cache cleared");
};

export const clearPlaylistCache = async (): Promise<void> => {
  await AsyncStorage.multiRemove([PLAYLIST_META_KEY, PLAYLIST_ETAG_KEY]);
  clearPlaylistFiles();
  console.log("[CACHE] Playlist cache cleared");
};

// ─── Signage videos ───────────────────────────────────────────────────────────

/**
 * Signage video sync flow — mirrors playlist cache-first approach:
 *
 * 1. Load signage meta from AsyncStorage
 * 2. If files exist on disk → serve from local storage
 * 3. Check etag from server
 *    - Offline → return cached local URIs
 *    - etag matches → return cached local URIs
 *    - etag differs → clear files, redownload, update meta
 * 4. First run → download all videos
 */
export const fetchSignageVideos = async (): Promise<VideoItem[]> => {
  const outletId = await AsyncStorage.getItem("outlet_id");
  if (!outletId) {
    console.warn("[FETCH] No outlet_id in AsyncStorage");
    return [];
  }

  ensureSignageVideoDir();

  // ── Step 1: Load cached meta ──────────────────────────────────────────────
  let cachedMeta: SignageMeta | null = null;
  try {
    const raw = await AsyncStorage.getItem(SIGNAGE_META_KEY);
    if (raw) {
      const parsed: SignageMeta = JSON.parse(raw);
      if (parsed.outletId === outletId) cachedMeta = parsed;
    }
  } catch {
    console.warn("[CACHE] Failed to read signage meta");
  }

  const hasValidCache =
    cachedMeta !== null &&
    cachedMeta.items.length > 0 &&
    new File(cachedMeta.items[0].videoURI).exists;

  if (hasValidCache) {
    console.log(
      `[CACHE] Found ${cachedMeta!.items.length} signage videos on disk`,
    );
  }

  // ── Step 2: Check server etag ─────────────────────────────────────────────
  let serverEtag: string | null = null;
  let serverItemCount = 0;

  try {
    const version = await getSignageVersion();
    serverEtag = version.etag;
    serverItemCount = version.itemCount;
  } catch {
    console.warn("[SIGNAGE] Version check failed — offline");
  }

  // ── Step 3: Offline — serve cache ────────────────────────────────────────
  if (!serverEtag) {
    if (hasValidCache) {
      console.log(
        `[OFFLINE] Serving ${cachedMeta!.items.length} cached signage videos`,
      );
      return cachedMeta!.items.map((item) => ({
        videoURI: item.videoURI,
        cloudFrontURI: item.cloudFrontURI,
        rotate: item.rotate,
        sizeMb: item.sizeMb,
        optimized: item.optimized,
      }));
    }
    console.warn("[OFFLINE] No signage video cache — cannot serve media");
    return [];
  }

  // ── Step 4: etag matches — serve cache ────────────────────────────────────
  if (serverEtag === cachedMeta?.etag && hasValidCache) {
    console.log(
      `[CACHE HIT] Signage etag unchanged — ${cachedMeta!.items.length} videos`,
    );
    return cachedMeta!.items.map((item) => ({
      videoURI: item.videoURI,
      cloudFrontURI: item.cloudFrontURI,
      rotate: item.rotate,
      sizeMb: item.sizeMb,
      optimized: item.optimized,
    }));
  }

  // ── Step 5: etag changed or no cache — redownload ────────────────────────
  if (cachedMeta && cachedMeta.etag !== serverEtag) {
    console.log(
      `[SYNC] Signage etag changed: ${cachedMeta.etag} → ${serverEtag}`,
    );
    clearSignageVideoFiles();
  } else {
    console.log("[SYNC] No signage cache — first download");
  }

  if (serverItemCount === 0) {
    console.warn("[SIGNAGE] No videos on server");
    return [];
  }

  // ── Step 6: Fetch video list from backend ────────────────────────────────
  let rawVideos: Array<{
    key?: string;
    videoURI: string;
    rotate?: boolean;
    sizeMb?: number;
    optimized?: boolean;
  }> = [];

  try {
    const response = await fetch(api.signageVideos, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data?.message || "Failed to fetch videos");
    rawVideos = data?.videos || [];
  } catch (err) {
    console.error("[FETCH ERROR] Signage videos:", err);
    if (hasValidCache) {
      console.warn("[FALLBACK] Using stale cache after fetch failure");
      return cachedMeta!.items.map((item) => ({
        videoURI: item.videoURI,
        cloudFrontURI: item.cloudFrontURI,
        rotate: item.rotate,
        sizeMb: item.sizeMb,
        optimized: item.optimized,
      }));
    }
    return [];
  }

  // ── Step 7: Download all videos to device storage ────────────────────────
  console.log(`[SYNC] Downloading ${rawVideos.length} signage video(s)...`);

  const downloadResults = await Promise.allSettled(
    rawVideos.map(async (video) => {
      const cloudFrontURI = sanitizeVideoUrl(video.videoURI);
      if (!cloudFrontURI.startsWith("https://")) return null;

      // Derive a key from the URL if not provided
      const key = video.key || cloudFrontURI.split("/").pop() || cloudFrontURI;
      const localUri = await downloadSignageVideo(key, cloudFrontURI);

      return {
        key,
        videoURI: localUri, // local path for player
        cloudFrontURI, // original URL for reference
        rotate: video.rotate,
        sizeMb: video.sizeMb,
        optimized: video.optimized,
      } as SignageMetaItem;
    }),
  );

  const successful = downloadResults
    .filter(
      (r): r is PromiseFulfilledResult<SignageMetaItem> =>
        r.status === "fulfilled" && r.value !== null,
    )
    .map((r) => r.value!);

  const failed = downloadResults.filter((r) => r.status === "rejected").length;
  if (failed > 0)
    console.warn(`[SYNC] ${failed} signage video(s) failed to download`);

  console.log(
    `[SYNC] Downloaded ${successful.length}/${rawVideos.length} signage video(s)`,
  );

  if (successful.length === 0) {
    console.warn("[SYNC] All signage downloads failed");
    return hasValidCache
      ? cachedMeta!.items.map((item) => ({
          videoURI: item.videoURI,
          cloudFrontURI: item.cloudFrontURI,
          rotate: item.rotate,
          sizeMb: item.sizeMb,
          optimized: item.optimized,
        }))
      : [];
  }

  // ── Step 8: Save meta ─────────────────────────────────────────────────────
  const newMeta: SignageMeta = {
    etag: serverEtag,
    outletId,
    items: successful,
    cachedAt: Date.now(),
  };

  await AsyncStorage.setItem(SIGNAGE_META_KEY, JSON.stringify(newMeta));
  console.log(
    `[CACHE] Signage meta saved — ${successful.length} videos, etag: ${serverEtag}`,
  );

  return successful.map((item) => ({
    videoURI: item.videoURI,
    cloudFrontURI: item.cloudFrontURI,
    rotate: item.rotate,
    sizeMb: item.sizeMb,
    optimized: item.optimized,
  }));
};

// ─── Playlist helpers ─────────────────────────────────────────────────────────

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
  return new File(meta.items[0].localUri).exists;
};

const metaToPlaylistItems = (meta: PlaylistMeta): PlaylistItems[] =>
  meta.items.map((item) => ({
    key: item.key,
    type: item.type,
    url: item.url,
    localUri: item.localUri,
    rotate: item.rotate,
  }));

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
      const localUri = await downloadPlaylistFile(item.key, item.url);
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
  await AsyncStorage.multiSet([
    [PLAYLIST_META_KEY, JSON.stringify(meta)],
    [PLAYLIST_ETAG_KEY, etag],
  ]);
  console.log(
    `[CACHE] Playlist meta saved — ${items.length} items, etag: ${etag}`,
  );
};

// ─── Main playlist fetch ──────────────────────────────────────────────────────

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

  if (!serverEtag) {
    if (hasValidCache) {
      console.log(`[OFFLINE] Serving ${cachedMeta!.items.length} cached items`);
      return metaToPlaylistItems(cachedMeta!);
    }
    console.warn("[OFFLINE] No cache available");
    return [];
  }

  const cachedEtag = cachedMeta?.etag ?? null;

  if (serverEtag === cachedEtag && hasValidCache) {
    console.log(
      `[CACHE HIT] etag unchanged — serving ${cachedMeta!.items.length} items`,
    );
    return metaToPlaylistItems(cachedMeta!);
  }

  if (cachedMeta && cachedEtag !== serverEtag) {
    console.log(`[SYNC] etag changed: ${cachedEtag} → ${serverEtag}`);
    clearPlaylistFiles();
  } else {
    console.log(`[SYNC] No cache — first download`);
  }

  if (manifest.length === 0) {
    console.warn("[SYNC] Empty manifest — nothing to download");
    return [];
  }

  let typeMap: Record<string, { type: "video" | "image"; rotate?: boolean }> =
    {};
  try {
    typeMap = await fetchTypeMap(outletId, batchNumber, tier, orientation);
  } catch (err) {
    console.error("[FETCH ERROR] Could not fetch playlist metadata:", err);
    if (hasValidCache) {
      console.warn("[FALLBACK] Using stale cache");
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
