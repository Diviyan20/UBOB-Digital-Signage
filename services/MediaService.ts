import { api } from "@/components/api/client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, File, Paths } from "expo-file-system/next";

// Interfaces
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

export interface ManifestItem {
  key: string;
  url: string;
}

export interface PlaylistVersionResult {
  etag: string | null;
  itemCount: number;
  manifest: ManifestItem[];
}

export interface PlaylistRefreshResult {
  changed: boolean;
  playlist: PlaylistItems[];
  oldFilesToDelete: string[];
  etag: string | null;
}

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

export interface SignageVersion {
  etag: string | null;
  itemCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Playlist metadata
// ─────────────────────────────────────────────────────────────────────────────

interface PlaylistMeta {
  outletId: string;
  batchNumber: string;
  tier: string;
  orientation: string;
  etag: string;
  items: PlaylistItems[];
}

// Cache keys
const VIDEO_CACHE_KEY = "signage_videos_cache";
const SIGNAGE_META_KEY = "signage_videos_meta";
const PLAYLIST_META_KEY = "playlist_meta";
const MEDIA_READY_KEY = "media_ready";

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

const ensurePlaylistDir = (): Directory => {
  const dir = getPlaylistDir();

  if (!dir.exists) {
    dir.create();
    console.log("[FS] Created playlist directory");
  }

  return dir;
};

export const deletePlaylistFiles = async (
  files: string[],
  activeLocalUri?: string,
): Promise<void> => {
  for (const uri of files) {
    if (!uri) {
      continue;
    }

    // Never delete the file currently being played.
    if (uri === activeLocalUri) {
      console.log(`[CLEANUP] Keeping active file: ${uri}`);
      continue;
    }

    try {
      const file = new File(uri);

      if (file.exists) {
        file.delete();

        console.log(`[CLEANUP] Deleted obsolete file: ${uri}`);
      }
    } catch (error) {
      console.warn(`[CLEANUP] Failed to delete: ${uri}`, error);
    }
  }
};

const getSafeFilename = (key: string): string => {
  const filename = key.split("/").pop() || "media";

  return filename.replace(/[<>:"/\\|?*]/g, "_").replace(/\s+/g, "-");
};

/*
─────────────────────────────────────────────────────────────────────────────
PLAYLIST API
─────────────────────────────────────────────────────────────────────────────
*/
export const getPlaylistVersion = async (
  outletId: string,
  batchNumber: string,
  tier: string,
  orientation: string,
): Promise<PlaylistVersionResult> => {
  const response = await fetch(api.playlistVersion, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      outlet_id: outletId,
      batch_number: batchNumber,
      tier,
      orientation,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.message || "Failed to fetch playlist manifest");
  }

  return {
    etag: data.etag ?? null,
    itemCount: data.itemCount ?? 0,
    manifest: data.manifest ?? [],
  };
};

const fetchPlaylistTypes = async (
  outletId: string,
  batchNumber: string,
  tier: string,
  orientation: string,
): Promise<Record<string, { type: "video" | "image"; rotate?: boolean }>> => {
  const response = await fetch(api.playlist, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      outlet_id: outletId,
      batch_number: Number(batchNumber),
      tier,
      orientation,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.message || "Failed to fetch playlist metadata");
  }

  const items: PlaylistItems[] = data.playlist ?? [];

  return Object.fromEntries(
    items.map((item) => [
      item.key,
      {
        type: item.type,
        rotate: item.rotate,
      },
    ]),
  );
};

const getLocalPlaylistContext = async (): Promise<{
  outletId: string;
  batchNumber: string;
  tier: string;
  orientation: string;
}> => {
  const outletId = await AsyncStorage.getItem("outlet_id");
  const batchNumber = (await AsyncStorage.getItem("batch_number")) || "1";
  const tier = (await AsyncStorage.getItem("tier")) || "Tier A";
  const orientation =
    (await AsyncStorage.getItem("orientation")) || "Landscape";

  if (!outletId) throw new Error("No Outlet ID found.");

  return {
    outletId,
    batchNumber,
    tier,
    orientation,
  };
};

export const refreshPreparedPlaylist =
  async (): Promise<PlaylistRefreshResult> => {
    const { outletId, batchNumber, tier, orientation } =
      await getLocalPlaylistContext();

    // Load what the TV is currently using.
    const currentPlaylist = await loadPreparedPlaylist();

    if (currentPlaylist.length === 0) {
      console.warn("[REFRESH] No prepared playlist found");

      return {
        changed: false,
        playlist: [],
        oldFilesToDelete: [],
        etag: null,
      };
    }

    const currentMetaRaw = await AsyncStorage.getItem(PLAYLIST_META_KEY);

    if (!currentMetaRaw) {
      console.warn("[REFRESH] No playlist metadata found");

      return {
        changed: false,
        playlist: currentPlaylist,
        oldFilesToDelete: [],
        etag: null,
      };
    }

    const currentMeta: PlaylistMeta = JSON.parse(currentMetaRaw);

    // ───────────────────────────────────────────────────────────────────────
    // STEP 1
    // Only check the server version.
    // ───────────────────────────────────────────────────────────────────────

    const version = await getPlaylistVersion(
      outletId,
      batchNumber,
      tier,
      orientation,
    );

    if (!version.etag) {
      console.warn("[REFRESH] Server returned no ETag");

      return {
        changed: false,
        playlist: currentPlaylist,
        oldFilesToDelete: [],
        etag: currentMeta.etag,
      };
    }

    // Nothing changed.
    if (version.etag === currentMeta.etag) {
      console.log(`[REFRESH] No changes — ETag ${version.etag}`);

      return {
        changed: false,
        playlist: currentPlaylist,
        oldFilesToDelete: [],
        etag: version.etag,
      };
    }

    console.log(
      `[REFRESH] Playlist changed: ${currentMeta.etag} → ${version.etag}`,
    );

    // ───────────────────────────────────────────────────────────────────────
    // STEP 2
    // Get the new type information.
    // ───────────────────────────────────────────────────────────────────────

    const typeMap = await fetchPlaylistTypes(
      outletId,
      batchNumber,
      tier,
      orientation,
    );

    // Current items by key.
    const currentByKey = new Map(
      currentPlaylist.map((item) => [item.key, item]),
    );

    // New playlist in server order.
    const newPlaylist: PlaylistItems[] = [];

    for (const manifestItem of version.manifest) {
      const url = sanitizeVideoUrl(manifestItem.url);

      if (!url.startsWith("https://")) {
        throw new Error(`Invalid media URL: ${manifestItem.key}`);
      }

      const metadata = typeMap[manifestItem.key];

      if (!metadata) {
        throw new Error(`Missing media type: ${manifestItem.key}`);
      }

      const existing = currentByKey.get(manifestItem.key);

      // Same key + same URL + local file still exists.
      // Nothing needs downloading.
      if (
        existing &&
        existing.url === url &&
        new File(existing.localUri).exists
      ) {
        newPlaylist.push({
          ...existing,
          type: metadata.type,
          rotate: metadata.rotate,
        });

        currentByKey.delete(manifestItem.key);

        continue;
      }

      // New media OR same key with a different URL.
      console.log(`[REFRESH] Downloading: ${manifestItem.key}`);

      const localUri = await downloadMediaFile(manifestItem.key, url);

      newPlaylist.push({
        key: manifestItem.key,
        type: metadata.type,
        url,
        localUri,
        rotate: metadata.rotate,
      });

      // Mark it as handled.
      currentByKey.delete(manifestItem.key);
    }

    // ───────────────────────────────────────────────────────────────────────
    // STEP 3
    // Anything left in currentByKey no longer exists
    // in the new server playlist.
    //
    // IMPORTANT:
    // We DO NOT delete these files yet.
    // PlaylistComponent may still be playing one of them.
    // ───────────────────────────────────────────────────────────────────────

    const oldFilesToDelete = Array.from(currentByKey.values()).map(
      (item) => item.localUri,
    );

    // ───────────────────────────────────────────────────────────────────────
    // STEP 4
    // Save the new playlist metadata.
    // ───────────────────────────────────────────────────────────────────────

    await savePreparedPlaylist(
      outletId,
      batchNumber,
      tier,
      orientation,
      version.etag,
      newPlaylist,
    );

    console.log(`[REFRESH] New playlist ready — ${newPlaylist.length} item(s)`);

    return {
      changed: true,
      playlist: newPlaylist,
      oldFilesToDelete,
      etag: version.etag,
    };
  };

/*
─────────────────────────────────────────────────────────────────────────────
DOWNLOAD ONE MEDIA FILE
─────────────────────────────────────────────────────────────────────────────
*/
const downloadMediaFile = async (key: string, url: string): Promise<string> => {
  const dir = ensurePlaylistDir();
  const filename = getSafeFilename(key);
  const destination = new File(dir, filename);

  if (destination.exists) {
    console.log(`[DOWNLOAD] Already exists: ${filename}`);
    return destination.uri;
  }

  console.log(`[DOWNLOAD] Starting: ${filename}`);

  const downloaded = await File.downloadFileAsync(url, destination);

  if (!downloaded.exists) {
    throw new Error(`Download completed but file does not exist: ${filename}`);
  }

  console.log(`[DOWNLOAD] Completed: ${filename}`);

  return downloaded.uri;
};

/*
─────────────────────────────────────────────────────────────────────────────
SAVE/LOAD PREPARED PLAYLIST
─────────────────────────────────────────────────────────────────────────────
*/
const savePreparedPlaylist = async (
  outletId: string,
  batchNumber: string,
  tier: string,
  orientation: string,
  etag: string,
  items: PlaylistItems[],
): Promise<void> => {
  const meta: PlaylistMeta = {
    outletId,
    batchNumber,
    tier,
    orientation,
    etag,
    items,
  };

  await AsyncStorage.multiSet([
    [PLAYLIST_META_KEY, JSON.stringify(meta)],
    [MEDIA_READY_KEY, "true"],
  ]);

  console.log(`[MEDIA] Playlist ready — ${items.length} item(s)`);
};

export const loadPreparedPlaylist = async (): Promise<PlaylistItems[]> => {
  try {
    const raw = await AsyncStorage.getItem(PLAYLIST_META_KEY);

    if (!raw) {
      return [];
    }

    const meta: PlaylistMeta = JSON.parse(raw);

    if (!Array.isArray(meta.items) || meta.items.length === 0) {
      return [];
    }

    const allFilesExist = meta.items.every(
      (item) => new File(item.localUri).exists,
    );

    if (!allFilesExist) {
      console.warn(
        "[MEDIA] Playlist metadata exists, but one or more files are missing",
      );
      return [];
    }

    return meta.items;
  } catch (error) {
    console.error("[MEDIA] Failed to load prepared playlist:", error);
    return [];
  }
};

export const isMediaReady = async (): Promise<boolean> => {
  const ready = await AsyncStorage.getItem(MEDIA_READY_KEY);

  if (ready !== "true") {
    return false;
  }

  const playlist = await loadPreparedPlaylist();
  return playlist.length > 0;
};

export const clearPlaylistCache = async (): Promise<void> => {
  await AsyncStorage.multiRemove([PLAYLIST_META_KEY, MEDIA_READY_KEY]);

  const dir = getPlaylistDir();

  if (dir.exists) {
    dir.delete();
  }

  console.log("[MEDIA] Playlist cache cleared");
};

/*
─────────────────────────────────────────────────────────────────────────────
MAIN: Prepare complete Media Player playlist
─────────────────────────────────────────────────────────────────────────────
*/
export interface MediaDownloadProgress {
  completed: number;
  total: number;
  currentFile: string;
}

export const prepareMediaPlaylist = async (
  outletId: string,
  batchNumber: number,
  tier: string,
  orientation: string,
  onProgress?: (progress: MediaDownloadProgress) => void,
): Promise<PlaylistItems[]> => {
  console.log(`[MEDIA] Preparing playlist: 
    outlet=${outletId}, 
    batch=${batchNumber}, 
    tier=${tier}, 
    orientation=${orientation}`);

  // We are intentionally doing a complete fresh download for now.
  // Incremental media updates will be added later.
  await clearPlaylistCache();
  ensurePlaylistDir();

  // 1. Get current playlist manifest
  const version = await getPlaylistVersion(
    outletId,
    batchNumber.toString(),
    tier,
    orientation,
  );

  if (!version.etag) {
    throw new Error("Playlist has no version");
  }
  if (version.manifest.length === 0) {
    throw new Error("Playlist contains no media");
  }

  console.log(`[MEDIA] Found ${version.manifest.length} media item(s)`);

  // 2. Get media type information
  const typeMap = await fetchPlaylistTypes(
    outletId,
    batchNumber.toString(),
    tier,
    orientation,
  );

  const total = version.manifest.length;
  const downloadedItems: PlaylistItems[] = [];

  // 3. Download ONE FILE AT A TIME
  //
  // This is intentional.
  // Weak TV sticks do not need multiple simultaneous downloads.
  for (let i = 0; i < version.manifest.length; i++) {
    const manifestItem = version.manifest[i];

    const url = sanitizeVideoUrl(manifestItem.url);

    if (!url.startsWith("https://")) {
      throw new Error(`Invalid media URL for ${manifestItem.key}`);
    }

    const metadata = typeMap[manifestItem.key];

    if (!metadata) {
      throw new Error(`Missing media type for ${manifestItem.key}`);
    }

    onProgress?.({
      completed: i,
      total,
      currentFile: getSafeFilename(manifestItem.key),
    });

    const localUri = await downloadMediaFile(manifestItem.key, url);

    downloadedItems.push({
      key: manifestItem.key,
      type: metadata.type,
      url,
      localUri,
      rotate: metadata.rotate,
    });

    onProgress?.({
      completed: i + 1,
      total,
      currentFile: getSafeFilename(manifestItem.key),
    });
  }

  // 4. Absolute requirement:
  // EVERY media file must exist before we declare success.
  const allFilesExist = downloadedItems.every(
    (item) => new File(item.localUri).exists,
  );

  if (!allFilesExist) {
    await clearPlaylistCache();

    throw new Error("Media preparation failed: one or more files are missing");
  }

  // 5. Save playlist only after EVERY file is ready
  await savePreparedPlaylist(
    outletId,
    batchNumber.toString(),
    tier,
    orientation,
    version.etag,
    downloadedItems,
  );

  console.log(
    `[MEDIA] Preparation complete — ${downloadedItems.length}/${total} downloaded`,
  );

  return downloadedItems;
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

export const clearVideoCache = async (): Promise<void> => {
  await AsyncStorage.multiRemove([VIDEO_CACHE_KEY, SIGNAGE_META_KEY]);
  clearSignageVideoFiles();
  console.log("[CACHE] Signage video cache cleared");
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
