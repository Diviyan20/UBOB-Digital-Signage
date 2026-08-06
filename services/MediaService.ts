import { api } from "@/components/api/client";
import AsyncStorage from "@react-native-async-storage/async-storage";

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
  rotate?: boolean;
}

// Cache keys
const VIDEO_CACHE_KEY = "signage_videos_cache";
const PLAYLIST_CACHE_KEY = "playlist_cache";
const CACHE_TTL_MS = 23 * 60 * 60 * 1000; // 23 hours

interface VideoCache {
  etag: string;
  videos: VideoItem[];
  cachedAt: number;
  outletId: string;
}

interface PlaylistCache {
  etag: string;
  playlist: PlaylistItems[];
  outletId: string;
  batchNumber: string;
  tier: string;
  orientation: string;
}

export interface ManifestItem {
  key: string; // S3 key — stable identifier for the file
  url: string; // CloudFront/presigned URL — used to fetch the file
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

/* ---------- VERSION HELPERS ------------- */

export const getSignageVersion = async (): Promise<SignageVersion> => {
  try {
    const response = await fetch(api.signageVersion);
    const data = await response.json();

    if (!response.ok) return { etag: null, itemCount: 0 };

    return {
      etag: data.etag ?? null,
      itemCount: data.itemCount ?? 0,
    };
  } catch {
    return { etag: null, itemCount: 0 };
  }
};

/**
 * Fetches etag + full file manifest from the backend.
 * The manifest lists every file currently in the S3 folder.
 * Returns null manifest on failure.
 */
export const getPlaylistVersion = async (
  outletId: string,
  batchNumber: string,
  tier: string,
  orientation: string,
): Promise<PlaylistVersionResult> => {
  try {
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
  } catch (err) {
    console.warn("[VERSION FETCH FAILED]", err);
    return { etag: null, itemCount: 0, manifest: [] };
  }
};

export const clearVideoCache = async (): Promise<void> => {
  await AsyncStorage.removeItem(VIDEO_CACHE_KEY);
  console.log("[CACHE] Signage video cache cleared");
};

export const clearPlaylistCache = async (): Promise<void> => {
  await AsyncStorage.removeItem(PLAYLIST_CACHE_KEY);
  console.log("[CACHE] Playlist cache cleared");
};

/* ---------- PLAYLIST SYNC ------------- */

/**
 * Diffs the server manifest against the cached playlist.
 *
 * Returns:
 *   toAdd    — files in the manifest that aren't in the cache (need downloading)
 *   toRemove — files in the cache that aren't in the manifest (need deleting)
 *   unchanged — files present in both (keep as-is)
 */
const diffManifest = (
  manifest: ManifestItem[],
  cachedPlaylist: PlaylistItems[],
): {
  toAdd: ManifestItem[];
  toRemove: PlaylistItems[];
  unchanged: PlaylistItems[];
} => {
  const manifestKeys = new Set(manifest.map((m) => m.key));
  const cachedKeys = new Set(cachedPlaylist.map((p) => p.key));

  const toAdd = manifest.filter((m) => !cachedKeys.has(m.key));

  const toRemove = cachedPlaylist.filter((p) => !manifestKeys.has(p.key));

  const unchanged = cachedPlaylist.filter((p) => manifestKeys.has(p.key));

  return { toAdd, toRemove, unchanged };
};

/**
 * Fetches only the new items from the backend by requesting a filtered playlist.
 * Sends the list of URLs that need to be added so the backend returns only those.
 *
 * Falls back to fetching the full playlist if the selective endpoint isn't available.
 */
const fetchNewItems = async (
  toAdd: ManifestItem[],
  outletId: string,
  batchNumber: string,
  tier: string,
  orientation: string,
): Promise<PlaylistItems[]> => {
  if (toAdd.length === 0) return [];

  console.log(`[FETCH] Downloading ${toAdd.length} new item(s)...`);

  try {
    // Request only the specific new URLs from the backend
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
    if (!response.ok)
      throw new Error(data?.message || "Failed to fetch new items");
    const fullPlaylist: PlaylistItems[] = data.playlist || [];

    // Filter client-side to only the URLs we actually need
    const toAddKeys = new Set(toAdd.map((m) => m.key));
    const newItems = fullPlaylist.filter((item) => toAddKeys.has(item.key));

    console.log(
      `[FETCH] Got ${fullPlaylist.length} total, filtered to ${newItems.length} new item(s)`,
    );
    return newItems;
  } catch (err) {
    console.error("[FETCH ERROR] New items:", err);
    return [];
  }
};

/**
 * Syncs the playlist cache against the server manifest.
 *
 * Flow:
 *  1. Fetch etag + manifest from server (lightweight — just metadata)
 *  2. If etag matches cache → return cached playlist immediately, no downloads
 *  3. If etag differs → diff manifest vs cache
 *     - Download only new files
 *     - Remove deleted files from cache
 *     - Keep unchanged files as-is
 *  4. Save updated playlist to cache with new etag
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

  // Step 1: Get server version + manifest (metadata only, no media transfer)
  const { etag: serverEtag, manifest } = await getPlaylistVersion(
    outletId,
    batchNumber,
    tier,
    orientation,
  );

  // Step 2: Check cache
  let cachedPlaylist: PlaylistItems[] = [];
  let cacheEtag: string | null = null;

  try {
    const cachedRaw = await AsyncStorage.getItem(PLAYLIST_CACHE_KEY);
    if (cachedRaw) {
      const cache: PlaylistCache = JSON.parse(cachedRaw);

      const sameContext =
        cache.outletId === outletId &&
        cache.batchNumber === batchNumber &&
        cache.tier === tier &&
        cache.orientation === orientation;

      if (sameContext) {
        cachedPlaylist = cache.playlist;
        cacheEtag = cache.etag;
      }
    }
  } catch {
    console.warn("[CACHE] Failed to read playlist cache");
  }

  // Step 3: Etag matches — nothing changed, return cache immediately
  if (serverEtag && serverEtag === cacheEtag && cachedPlaylist.length > 0) {
    console.log(
      `[CACHE HIT] Playlist unchanged — etag: ${serverEtag}, ${cachedPlaylist.length} items`,
    );

    return cachedPlaylist;
  }

  // Step 4: Etag differs — diff and sync
  console.log(
    `[CACHE STALE] Playlist changed — cached: ${cacheEtag}, server: ${serverEtag}`,
  );

  if (manifest.length === 0) {
    // Can't diff without a manifest — fall back to full fetch
    console.warn(
      "[SYNC] Empty manifest from server — falling back to full fetch",
    );
    return fetchFullPlaylist(
      outletId,
      batchNumber,
      tier,
      orientation,
      serverEtag,
    );
  }

  const { toAdd, toRemove, unchanged } = diffManifest(manifest, cachedPlaylist);

  console.log(
    `[SYNC] +${toAdd.length} new, -${toRemove.length} deleted, =${unchanged.length} unchanged`,
  );

  // Download only the new items
  const newItems = await fetchNewItems(
    toAdd,
    outletId,
    batchNumber,
    tier,
    orientation,
  );

  // Build updated playlist: keep unchanged + add new (maintain manifest order)
  const unchangedUrls = new Set(unchanged.map((p) => p.url));
  const updatedPlaylist: PlaylistItems[] = [...unchanged, ...newItems].sort(
    (a, b) => {
      // Preserve manifest order
      const aIndex = manifest.findIndex((m) => m.url === a.url);
      const bIndex = manifest.findIndex((m) => m.url === b.url);
      return aIndex - bIndex;
    },
  );

  console.log(
    `[SYNC] Playlist updated — ${toRemove.length} removed, ${newItems.length} added, ${updatedPlaylist.length} total`,
  );

  // Step 5: Save updated cache
  const cachePayload: PlaylistCache = {
    etag: serverEtag || "",
    playlist: updatedPlaylist,
    outletId,
    batchNumber,
    tier,
    orientation,
  };

  if (updatedPlaylist.length === 0 && cachedPlaylist.length > 0) {
    console.warn("[SYNC] New playlist empty, keeping existing cache");

    return cachedPlaylist;
  }

  await AsyncStorage.setItem(PLAYLIST_CACHE_KEY, JSON.stringify(cachePayload));
  console.log(
    `[CACHE] Playlist cached — ${updatedPlaylist.length} items, etag: ${serverEtag}`,
  );

  return updatedPlaylist;
};

/**
 * Full playlist fetch — used as a fallback when manifest is unavailable.
 */
const fetchFullPlaylist = async (
  outletId: string,
  batchNumber: string,
  tier: string,
  orientation: string,
  serverEtag: string | null,
): Promise<PlaylistItems[]> => {
  console.log("[FETCH] Full playlist fetch (fallback)...");
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
    if (!response.ok)
      throw new Error(data?.message || "Failed to fetch playlist");

    const playlist: PlaylistItems[] = data.playlist || [];

    const cachePayload: PlaylistCache = {
      etag: serverEtag || "",
      playlist,
      outletId,
      batchNumber,
      tier,
      orientation,
    };

    await AsyncStorage.setItem(
      PLAYLIST_CACHE_KEY,
      JSON.stringify(cachePayload),
    );
    console.log(
      `[CACHE] Playlist cached (full fetch) — ${playlist.length} items`,
    );
    return playlist;
  } catch (err) {
    console.error("[FETCH ERROR] Full playlist:", err);
    return [];
  }
};

/* ---------- SIGNAGE VIDEOS ------------- */

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
