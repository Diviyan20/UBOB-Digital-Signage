import { api } from "@/components/api/client";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface VideoItem {
  videoURI: string;
  rotate?: boolean;
  sizeMb?: number;
  optimized?: boolean;
}

export interface PlaylistItems {
  type: "video" | "image";
  url: string;
  rotate?: boolean;
}

// Cache config
const VIDEO_CACHE_KEY = "signage_videos_cache";
const PLAYLIST_CACHE_KEY = "playlist_cache";
const CACHE_TTL_MS = 23 * 60 * 60 * 1000; // 23 hours

interface VideoCache {
  etag: string;
  videos: VideoItem[];
  cachedAt: number;
  outletId: string; // invalidate if outlet changes
}

interface PlaylistCache {
  etag: string;
  playlist: PlaylistItems[];
  outletId: string;
  batchNumber: string;
  tier: string;
  orientation: string;
}

export interface SignageVersion {
  etag: string | null;
  itemCount: number;
}

/**
 * Removes invalid trailing characters from presigned URLs
 */
export const sanitizeVideoUrl = (url?: string): string => {
  return (url || "").trim().replace(/\\+$/g, "").replace(/\s+$/g, "");
};

/* ---------- VERSION HELPERS ------------- */
/**
 * Fetches the current server etag for the signage video folder.
 * Returns null on failure — caller decides how to handle.
 */
export const getSignageVersion = async (): Promise<SignageVersion> => {
  try {
    const response = await fetch(api.signageVersion);
    const data = await response.json();

    if (!response.ok) {
      return {
        etag: null,
        itemCount: 0,
      };
    }
    return {
      etag: data.etag ?? null,
      itemCount: data.itemCount ?? 0,
    };
  } catch {
    return {
      etag: null,
      itemCount: 0,
    };
  }
};

/**
 * Fetches the current server etag for a playlist folder.
 * Returns null on failure.
 */
export const getPlaylistVersion = async (
  outletId: string,
  batchNumber: string,
  tier: string,
  orientation: string,
): Promise<string | null> => {
  try {
    const response = await fetch(api.playlistVersion, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        outlet_id: outletId,
        batch_number: batchNumber,
        orientation,
      }),
    });
    const data = await response.json();

    console.log("[VERSION RESPONSE]", JSON.stringify(data, null, 2));

    if (!response.ok) {
      console.warn("[VERSION ERROR]", data?.message);
      return null;
    }
    console.log(`[VERSION] Playlist etag=${data.etag} items=${data.itemCount}`);
    return data.etag ?? null;
  } catch (err) {
    console.warn("[VERSION FETCH FAILED]", err);
    return null;
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

/**
 * Fetches signage videos (Version Aware).
 *
 * Cache flow:
 *   1. Check AsyncStorage for cached video list
 *   2. If valid cache exists → return it (no backend call)
 *   3. If cache is empty or expired → fetch from backend once
 *   4. Store result in AsyncStorage
 *   5. Frontend plays from CloudFront URLs — no further requests needed
 */
export const fetchSignageVideos = async (): Promise<VideoItem[]> => {
  const outletId = await AsyncStorage.getItem("outlet_id");
  if (!outletId) {
    console.warn("[FETCH] No outlet_id in AsyncStorage");
    return [];
  }

  // Step 1: Get server version (fast)
  const { etag: serverEtag } = await getSignageVersion();
  console.log(
    "[SIGNAGE STARTUP CHECK]",
    JSON.stringify({
      outletId,
      serverEtag,
    }),
  );

  // Step 2: Check cache
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

  // Step 3: Fetch fresh from backend
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

    // Step 4: Cache with etag
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

/*
 * Fetches the playlist (images + videos) from the backend. (Version Aware)
 * Reads outlet_id, batch_number, and orientation from AsyncStorage.
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

  console.log("========== PLAYLIST FETCH ==========");
  console.log("Outlet ID:", outletId);
  console.log("Batch Number:", batchNumber);
  console.log("Tier:", tier);
  console.log("Orientation:", orientation);
  console.log("====================================");

  // Step 1: Get server version (fast)
  const serverEtag = await getPlaylistVersion(
    outletId,
    batchNumber,
    tier,
    orientation,
  );
  console.log("========== VERSION PARAMS ==========");
  console.log("Outlet ID:", outletId);
  console.log("Batch Number:", batchNumber);
  console.log("Tier:", tier);
  console.log("Orientation:", orientation);
  console.log("====================================");

  // Step 2: Check cache
  try {
    const cachedRaw = await AsyncStorage.getItem(PLAYLIST_CACHE_KEY);
    if (cachedRaw) {
      const cache: PlaylistCache = JSON.parse(cachedRaw);

      const sameContext =
        cache.outletId === outletId &&
        cache.batchNumber === batchNumber &&
        cache.tier === tier &&
        cache.orientation === orientation;
      const etagMatch = serverEtag && cache.etag === serverEtag;

      if (sameContext && (etagMatch || !serverEtag)) {
        console.log(
          `[CACHE HIT] Playlist — etag: ${cache.etag}, ${cache.playlist.length} items`,
        );
        return cache.playlist;
      }

      console.log(
        `[CACHE STALE] Playlist — cached: ${cache.etag}, server: ${serverEtag}`,
      );
    } else {
      console.log("[CACHE MISS] No playlist cache");
    }
  } catch {
    console.warn("[CACHE] Failed to read playlist cache");
  }

  // Step 3: Fetch fresh
  console.log("[FETCH] Fetching fresh playlist...");
  try {
    const response = await fetch(api.playlist, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        outlet_id: outletId,
        batch_number: parseInt(batchNumber),
        tier: tier,
        orientation,
      }),
    });

    const data = await response.json();
    if (!response.ok)
      throw new Error(data?.message || "Failed to fetch playlist");

    const playlist: PlaylistItems[] = data.playlist || [];

    // Step 4: Cache with etag
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
      `[CACHE] Playlist cached — ${playlist.length} items, etag: ${serverEtag}`,
    );
    return playlist;
  } catch (err) {
    console.error("[FETCH ERROR] Playlist:", err);
    return [];
  }
};
