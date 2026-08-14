import { api } from "@/components/api/client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, File, Paths } from "expo-file-system/next";

// ─────────────────────────────────────────────────────────────────────────────
// Interfaces
// ─────────────────────────────────────────────────────────────────────────────

export interface VideoItem {
  videoURI: string;
  cloudFrontURI: string;
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

export interface SignageVersion {
  etag: string | null;
  itemCount: number;
}

interface SignageMeta {
  etag: string;
  outletId: string;
  items: SignageMetaItem[];
  cachedAt: number;
}

interface SignageMetaItem {
  key: string;
  videoURI: string;
  cloudFrontURI: string;
  rotate?: boolean;
  sizeMb?: number;
  optimized?: boolean;
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

// ─────────────────────────────────────────────────────────────────────────────
// Storage keys
// ─────────────────────────────────────────────────────────────────────────────

const VIDEO_CACHE_KEY = "signage_videos_cache";
const SIGNAGE_META_KEY = "signage_videos_meta";

const PLAYLIST_META_KEY = "playlist_meta";
const MEDIA_READY_KEY = "media_ready";

const MEDIA_DOWNLOAD_STATE_KEY = "media_download_state";

const MEDIA_RETRY_COUNT_KEY = "media_retry_count";

const MEDIA_RETRY_BLOCK_UNTIL_KEY = "media_retry_block_until";

// ─────────────────────────────────────────────────────────────────────────────
// Retry configuration
// ─────────────────────────────────────────────────────────────────────────────

const MAX_MEDIA_RETRIES = 5;

const MEDIA_RETRY_COOLDOWN = 30 * 1000; // 5 minutes

// ─────────────────────────────────────────────────────────────────────────────
// Download state
// ─────────────────────────────────────────────────────────────────────────────

export type MediaDownloadStatus = "downloading" | "ready" | "error";

export interface MediaDownloadState {
  status: MediaDownloadStatus;
  completed: number;
  total: number;
  currentFile: string;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Progress
// ─────────────────────────────────────────────────────────────────────────────

export interface MediaDownloadProgress {
  completed: number;
  total: number;
  currentFile: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// URL helpers
// ─────────────────────────────────────────────────────────────────────────────

export const sanitizeVideoUrl = (url?: string): string => {
  return (url || "").trim().replace(/\\+$/g, "").replace(/\s+$/g, "");
};

// ─────────────────────────────────────────────────────────────────────────────
// File system helpers
// ─────────────────────────────────────────────────────────────────────────────

const keyToFilename = (key: string): string => {
  const parts = key.split("/");

  return (parts[parts.length - 1] || "media").replace(/\s+/g, "-");
};

const getSafeFilename = (key: string, etag?: string): string => {
  const filename = keyToFilename(key);

  if (!etag) {
    return filename;
  }

  const safeEtag = etag.replace(/[^a-zA-Z0-9_-]/g, "");

  return `${filename}_${safeEtag}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// Playlist directory
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Signage video directory
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Signage downloads
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Delete playlist files
// ─────────────────────────────────────────────────────────────────────────────

export const deletePlaylistFiles = async (
  files: string[],
  activeLocalUri?: string,
): Promise<void> => {
  for (const uri of files) {
    if (!uri) {
      continue;
    }

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

// ─────────────────────────────────────────────────────────────────────────────
// Playlist API
// ─────────────────────────────────────────────────────────────────────────────

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
): Promise<
  Record<
    string,
    {
      type: "video" | "image";
      rotate?: boolean;
    }
  >
> => {
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

// ─────────────────────────────────────────────────────────────────────────────
// Local playlist context
// ─────────────────────────────────────────────────────────────────────────────

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

  if (!outletId) {
    throw new Error("No Outlet ID found.");
  }

  return {
    outletId,
    batchNumber,
    tier,
    orientation,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Download one playlist media file
// ─────────────────────────────────────────────────────────────────────────────

const downloadMediaFile = async (
  key: string,
  url: string,
  etag?: string,
): Promise<string> => {
  const dir = ensurePlaylistDir();

  const filename = getSafeFilename(key, etag);

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

// ─────────────────────────────────────────────────────────────────────────────
// Save playlist metadata
// ─────────────────────────────────────────────────────────────────────────────

const savePreparedPlaylist = async (
  outletId: string,
  batchNumber: string,
  tier: string,
  orientation: string,
  etag: string,
  items: PlaylistItems[],
  ready: boolean,
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
    [MEDIA_READY_KEY, ready ? "true" : "false"],
  ]);

  console.log(
    `[MEDIA] Saved playlist — ${items.length} item(s), ready=${ready}`,
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Load any locally available media
// ─────────────────────────────────────────────────────────────────────────────
//
// IMPORTANT:
//
// During initial download, not every file exists yet.
// Therefore the player needs this function rather than
// loadPreparedPlaylist().
//
// ─────────────────────────────────────────────────────────────────────────────

export const loadAvailablePlaylist = async (): Promise<PlaylistItems[]> => {
  try {
    const raw = await AsyncStorage.getItem(PLAYLIST_META_KEY);

    if (!raw) {
      return [];
    }

    const meta: PlaylistMeta = JSON.parse(raw);

    if (!Array.isArray(meta.items)) {
      return [];
    }

    return meta.items.filter((item) => new File(item.localUri).exists);
  } catch (error) {
    console.error("[MEDIA] Failed to load available playlist:", error);

    return [];
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Load complete prepared playlist
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Download state
// ─────────────────────────────────────────────────────────────────────────────

const setMediaDownloadState = async (
  state: MediaDownloadState,
): Promise<void> => {
  await AsyncStorage.setItem(MEDIA_DOWNLOAD_STATE_KEY, JSON.stringify(state));
};

export const getMediaDownloadState = async (): Promise<MediaDownloadState> => {
  try {
    const raw = await AsyncStorage.getItem(MEDIA_DOWNLOAD_STATE_KEY);

    if (!raw) {
      return {
        status: "ready",
        completed: 0,
        total: 0,
        currentFile: "",
      };
    }

    return JSON.parse(raw);
  } catch {
    return {
      status: "ready",
      completed: 0,
      total: 0,
      currentFile: "",
    };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Media retry state
// ─────────────────────────────────────────────────────────────────────────────

export const getMediaRetryState = async (): Promise<{
  retryCount: number;
  blockedUntil: number;
}> => {
  const retryCount =
    Number(await AsyncStorage.getItem(MEDIA_RETRY_COUNT_KEY)) || 0;

  const blockedUntil =
    Number(await AsyncStorage.getItem(MEDIA_RETRY_BLOCK_UNTIL_KEY)) || 0;

  return {
    retryCount,
    blockedUntil,
  };
};

export const registerMediaRetryFailure = async (): Promise<{
  retryCount: number;
  blockedUntil: number;
  blocked: boolean;
}> => {
  const current = await getMediaRetryState();

  const now = Date.now();

  if (current.blockedUntil > now) {
    return {
      ...current,
      blocked: true,
    };
  }

  const retryCount = current.retryCount + 1;

  if (retryCount >= MAX_MEDIA_RETRIES) {
    const blockedUntil = now + MEDIA_RETRY_COOLDOWN;

    await AsyncStorage.multiSet([
      [MEDIA_RETRY_COUNT_KEY, "0"],
      [MEDIA_RETRY_BLOCK_UNTIL_KEY, blockedUntil.toString()],
    ]);

    return {
      retryCount,
      blockedUntil,
      blocked: true,
    };
  }

  await AsyncStorage.setItem(MEDIA_RETRY_COUNT_KEY, retryCount.toString());

  return {
    retryCount,
    blockedUntil: 0,
    blocked: false,
  };
};

export const resetMediaRetryState = async (): Promise<void> => {
  await AsyncStorage.multiRemove([
    MEDIA_RETRY_COUNT_KEY,
    MEDIA_RETRY_BLOCK_UNTIL_KEY,
  ]);
};

// ─────────────────────────────────────────────────────────────────────────────
// Media ready
// ─────────────────────────────────────────────────────────────────────────────

export const isMediaReady = async (): Promise<boolean> => {
  const ready = await AsyncStorage.getItem(MEDIA_READY_KEY);

  if (ready !== "true") {
    return false;
  }

  const playlist = await loadPreparedPlaylist();

  return playlist.length > 0;
};

// ─────────────────────────────────────────────────────────────────────────────
// Clear playlist
// ─────────────────────────────────────────────────────────────────────────────

export const clearPlaylistCache = async (): Promise<void> => {
  await AsyncStorage.multiRemove([
    PLAYLIST_META_KEY,
    MEDIA_READY_KEY,
    MEDIA_DOWNLOAD_STATE_KEY,
  ]);

  const dir = getPlaylistDir();

  if (dir.exists) {
    dir.delete();
  }

  console.log("[MEDIA] Playlist cache cleared");
};

// ─────────────────────────────────────────────────────────────────────────────
// INITIAL MEDIA PREPARATION
// ─────────────────────────────────────────────────────────────────────────────
//
// Downloads sequentially.
//
// The function resolves as soon as ONE media file is ready.
// The remaining files continue downloading in the background.
//
// ─────────────────────────────────────────────────────────────────────────────

export const prepareMediaPlaylist = async (
  outletId: string,
  batchNumber: number,
  tier: string,
  orientation: string,
  onProgress?: (progress: MediaDownloadProgress) => void,
): Promise<PlaylistItems[]> => {
  console.log(
    `[MEDIA] Preparing playlist: outlet=${outletId}, batch=${batchNumber}, tier=${tier}, orientation=${orientation}`,
  );

  await clearPlaylistCache();

  ensurePlaylistDir();

  const version = await getPlaylistVersion(
    outletId,
    batchNumber.toString(),
    tier,
    orientation,
  );

  if (!version.etag) {
    throw new Error("Could not get playlist version");
  }

  const etag = version.etag;

  if (version.manifest.length === 0) {
    throw new Error("Playlist contains no media");
  }

  const typeMap = await fetchPlaylistTypes(
    outletId,
    batchNumber.toString(),
    tier,
    orientation,
  );

  const total = version.manifest.length;

  const downloadedItems: PlaylistItems[] = [];

  let firstMediaResolve: ((items: PlaylistItems[]) => void) | null = null;

  let firstMediaReject: ((error: Error) => void) | null = null;

  let firstMediaReady = false;

  const firstMediaPromise = new Promise<PlaylistItems[]>((resolve, reject) => {
    firstMediaResolve = resolve;

    firstMediaReject = reject;
  });

  const downloadRemaining = async (): Promise<void> => {
    try {
      await setMediaDownloadState({
        status: "downloading",
        completed: 0,
        total,
        currentFile: "",
      });

      for (let i = 0; i < version.manifest.length; i++) {
        const manifestItem = version.manifest[i];

        const url = sanitizeVideoUrl(manifestItem.url);

        if (!url.startsWith("https://")) {
          throw new Error(`Invalid media URL: ${manifestItem.key}`);
        }

        const metadata = typeMap[manifestItem.key];

        if (!metadata) {
          throw new Error(`Missing media type: ${manifestItem.key}`);
        }

        const filename = getSafeFilename(manifestItem.key);

        await setMediaDownloadState({
          status: "downloading",
          completed: i,
          total,
          currentFile: filename,
        });

        if (!firstMediaReady) {
          onProgress?.({
            completed: i,
            total,
            currentFile: filename,
          });
        }

        console.log(`[DOWNLOAD] ${i + 1}/${total}: ${filename}`);

        const localUri = await downloadMediaFile(manifestItem.key, url, etag);

        const item: PlaylistItems = {
          key: manifestItem.key,
          type: metadata.type,
          url,
          localUri,
          rotate: metadata.rotate,
        };

        downloadedItems.push(item);

        // Persist every successful file.
        await savePreparedPlaylist(
          outletId,
          batchNumber.toString(),
          tier,
          orientation,
          etag,
          [...downloadedItems],
          false,
        );

        if (!firstMediaReady) {
          firstMediaReady = true;

          onProgress?.({
            completed: 1,
            total,
            currentFile: filename,
          });

          firstMediaResolve?.([...downloadedItems]);
        } else {
          console.log(`[MEDIA] Additional media ready: ${manifestItem.key}`);
        }

        await setMediaDownloadState({
          status: "downloading",
          completed: i + 1,
          total,
          currentFile: filename,
        });
      }

      // ALL media is now complete.
      await savePreparedPlaylist(
        outletId,
        batchNumber.toString(),
        tier,
        orientation,
        etag,
        downloadedItems,
        true,
      );

      await setMediaDownloadState({
        status: "ready",
        completed: total,
        total,
        currentFile: "",
      });

      await resetMediaRetryState();

      console.log(`[MEDIA] All ${total} media item(s) downloaded`);
    } catch (error: any) {
      const message = error?.message || "Media download failed";

      console.error("[MEDIA] Download failed:", message);

      await setMediaDownloadState({
        status: "error",
        completed: downloadedItems.length,
        total,
        currentFile: "",
        error: "Network connectivity issues, please try again",
      });

      // If nothing downloaded,
      // login must fail.
      if (!firstMediaReady) {
        firstMediaReject?.(
          new Error("Network connectivity issues, please try again"),
        );
      }
    }
  };

  // Start downloading.
  void downloadRemaining();

  // Wait only for the first successful file.
  return firstMediaPromise;
};

// ─────────────────────────────────────────────────────────────────────────────
// Incremental playlist refresh
// ─────────────────────────────────────────────────────────────────────────────

export const refreshPreparedPlaylist =
  async (): Promise<PlaylistRefreshResult> => {
    const { outletId, batchNumber, tier, orientation } =
      await getLocalPlaylistContext();

    const downloadState = await getMediaDownloadState();

    // Never run an update while initial media
    // is still downloading.
    if (downloadState.status === "downloading") {
      return {
        changed: false,
        playlist: await loadAvailablePlaylist(),
        oldFilesToDelete: [],
        etag: null,
      };
    }

    const currentPlaylist = await loadPreparedPlaylist();

    if (currentPlaylist.length === 0) {
      return {
        changed: false,
        playlist: [],
        oldFilesToDelete: [],
        etag: null,
      };
    }

    const currentMetaRaw = await AsyncStorage.getItem(PLAYLIST_META_KEY);

    if (!currentMetaRaw) {
      return {
        changed: false,
        playlist: currentPlaylist,
        oldFilesToDelete: [],
        etag: null,
      };
    }

    const currentMeta: PlaylistMeta = JSON.parse(currentMetaRaw);

    const version = await getPlaylistVersion(
      outletId,
      batchNumber,
      tier,
      orientation,
    );

    if (!version.etag) {
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

    const typeMap = await fetchPlaylistTypes(
      outletId,
      batchNumber,
      tier,
      orientation,
    );

    const currentByKey = new Map(
      currentPlaylist.map((item) => [item.key, item]),
    );

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

      // Existing item has not changed.
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

      // New item or changed URL.
      console.log(`[REFRESH] Downloading: ${manifestItem.key}`);

      const localUri = await downloadMediaFile(
        manifestItem.key,
        url,
        version.etag,
      );

      newPlaylist.push({
        key: manifestItem.key,
        type: metadata.type,
        url,
        localUri,
        rotate: metadata.rotate,
      });

      currentByKey.delete(manifestItem.key);
    }

    // Anything left is no longer in the new playlist.
    const oldFilesToDelete = Array.from(currentByKey.values()).map(
      (item) => item.localUri,
    );

    // New playlist is complete.
    await savePreparedPlaylist(
      outletId,
      batchNumber,
      tier,
      orientation,
      version.etag,
      newPlaylist,
      true,
    );

    console.log(`[REFRESH] New playlist ready — ${newPlaylist.length} item(s)`);

    return {
      changed: true,
      playlist: newPlaylist,
      oldFilesToDelete,
      etag: version.etag,
    };
  };

// ─────────────────────────────────────────────────────────────────────────────
// Signage version
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Clear signage cache
// ─────────────────────────────────────────────────────────────────────────────

export const clearVideoCache = async (): Promise<void> => {
  await AsyncStorage.multiRemove([VIDEO_CACHE_KEY, SIGNAGE_META_KEY]);

  clearSignageVideoFiles();

  console.log("[CACHE] Signage video cache cleared");
};

// ─────────────────────────────────────────────────────────────────────────────
// Signage videos
// ─────────────────────────────────────────────────────────────────────────────

export const fetchSignageVideos = async (): Promise<VideoItem[]> => {
  const outletId = await AsyncStorage.getItem("outlet_id");

  if (!outletId) {
    console.warn("[FETCH] No outlet_id in AsyncStorage");

    return [];
  }

  ensureSignageVideoDir();

  let cachedMeta: SignageMeta | null = null;

  try {
    const raw = await AsyncStorage.getItem(SIGNAGE_META_KEY);

    if (raw) {
      const parsed: SignageMeta = JSON.parse(raw);

      if (parsed.outletId === outletId) {
        cachedMeta = parsed;
      }
    }
  } catch {
    console.warn("[CACHE] Failed to read signage meta");
  }

  const hasValidCache =
    cachedMeta !== null &&
    cachedMeta.items.length > 0 &&
    new File(cachedMeta.items[0].videoURI).exists;

  let serverEtag: string | null = null;

  let serverItemCount = 0;

  try {
    const version = await getSignageVersion();

    serverEtag = version.etag;

    serverItemCount = version.itemCount;
  } catch {
    console.warn("[SIGNAGE] Version check failed");
  }

  if (!serverEtag) {
    if (hasValidCache) {
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

  if (serverEtag === cachedMeta?.etag && hasValidCache) {
    return cachedMeta!.items.map((item) => ({
      videoURI: item.videoURI,
      cloudFrontURI: item.cloudFrontURI,
      rotate: item.rotate,
      sizeMb: item.sizeMb,
      optimized: item.optimized,
    }));
  }

  if (cachedMeta && cachedMeta.etag !== serverEtag) {
    clearSignageVideoFiles();
  }

  if (serverItemCount === 0) {
    return [];
  }

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
      headers: {
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.message || "Failed to fetch videos");
    }

    rawVideos = data?.videos || [];
  } catch (err) {
    console.error("[FETCH ERROR] Signage videos:", err);

    if (hasValidCache) {
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

  const downloadResults = await Promise.allSettled(
    rawVideos.map(async (video) => {
      const cloudFrontURI = sanitizeVideoUrl(video.videoURI);

      if (!cloudFrontURI.startsWith("https://")) {
        return null;
      }

      const key = video.key || cloudFrontURI.split("/").pop() || cloudFrontURI;

      const localUri = await downloadSignageVideo(key, cloudFrontURI);

      return {
        key,
        videoURI: localUri,
        cloudFrontURI,
        rotate: video.rotate,
        sizeMb: video.sizeMb,
        optimized: video.optimized,
      } as SignageMetaItem;
    }),
  );

  const successful = downloadResults
    .filter(
      (result): result is PromiseFulfilledResult<SignageMetaItem> =>
        result.status === "fulfilled" && result.value !== null,
    )
    .map((result) => result.value);

  if (successful.length === 0) {
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

  const newMeta: SignageMeta = {
    etag: serverEtag,
    outletId,
    items: successful,
    cachedAt: Date.now(),
  };

  await AsyncStorage.setItem(SIGNAGE_META_KEY, JSON.stringify(newMeta));

  return successful.map((item) => ({
    videoURI: item.videoURI,
    cloudFrontURI: item.cloudFrontURI,
    rotate: item.rotate,
    sizeMb: item.sizeMb,
    optimized: item.optimized,
  }));
};
