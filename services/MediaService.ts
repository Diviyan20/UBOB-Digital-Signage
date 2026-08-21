import { api } from "@/components/api/client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, File, Paths } from "expo-file-system/next";

// =============================================================================
// Types
// =============================================================================

export type MediaFrequency = "Evergreen" | "Daily" | "LTO";
export type MediaType = "video" | "image";

export interface PlaylistItems {
  mediaUuid: string;
  key: string; // S3 object key
  type: MediaType;
  url: string;
  localUri: string;
  fileName: string;
  frequency: MediaFrequency;
  startDatetime: string | null;
  endDatetime: string | null;
}

export interface MediaPlayerConfigItem {
  video_uuid: string;
  video_name: string;
  object_key: string;
  type: MediaType;
  screen_type: "Media Player";
  batch_num: number;
  tier: string;
  orientation: "Landscape" | "Portrait";
  start_datetime: string | null;
  end_datetime: string | null;
  frequency: MediaFrequency;
  url: string;
}

export interface MediaPlayerConfigResponse {
  success: boolean;
  outlet: {
    outlet_id: string;
    outlet_name: string;
    tier: string;
  };
  etag: string;
  screens: MediaPlayerConfigItem[];
}

export interface MediaPlayerLoginPayload {
  outletId: string;
  batchNumber: number;
  tier: string;
  orientation: "Landscape" | "Portrait";
}

export interface MediaPlayerVersionResult {
  etag: string;
  itemCount: number;
}

export interface MediaDownloadProgress {
  completed: number;
  total: number;
  currentFile: string;
}

export type MediaDownloadStatus = "downloading" | "ready" | "error";

export interface MediaDownloadState {
  status: MediaDownloadStatus;
  completed: number;
  total: number;
  currentFile: string;
  error?: string;
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

export interface PreparedSignageVideo {
  videoURI: string;
  localUri: string;
  key: string;
  rotate?: boolean;
  sizeMb?: number;
  optimized?: boolean;
}

interface PlaylistMeta {
  outletId: string;
  batchNumber: number;
  tier: string;
  orientation: "Landscape" | "Portrait";
  etag: string;
  items: PlaylistItems[];
}

// =============================================================================
// Storage
// =============================================================================

const PLAYLIST_META_KEY = "playlist_meta";
const MEDIA_READY_KEY = "media_ready";
const MEDIA_DOWNLOAD_STATE_KEY = "media_download_state";

const MEDIA_RETRY_COUNT_KEY = "media_retry_count";
const MEDIA_RETRY_BLOCK_UNTIL_KEY = "media_retry_block_until";

const MAX_MEDIA_RETRIES = 5;
const MEDIA_RETRY_COOLDOWN = 5 * 60 * 1000;

// =============================================================================
// Generic helpers
// =============================================================================

export const sanitizeVideoUrl = (url?: string): string =>
  (url || "").trim().replace(/\\+$/g, "").replace(/\s+$/g, "");

const getPlaylistDir = (): Directory =>
  new Directory(Paths.document, "playlist");

const ensurePlaylistDir = (): Directory => {
  const dir = getPlaylistDir();

  if (!dir.exists) {
    dir.create();
  }

  return dir;
};

const keyToFilename = (key: string): string => {
  const fileName = key.split("/").pop() || "media";
  return fileName.replace(/\s+/g, "-");
};

// Tiny deterministic hash so a changed object key cannot collide with an old
// local file while the old file is still being played.
const hashString = (value: string): string => {
  let hash = 0;

  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }

  return Math.abs(hash).toString(16);
};

const getLocalFilename = (mediaUuid: string, objectKey: string): string => {
  return `${mediaUuid}_${hashString(objectKey)}_${keyToFilename(objectKey)}`;
};

// =============================================================================
// Media Player API
// =============================================================================

export const fetchMediaPlayerConfig = async (
  payload: MediaPlayerLoginPayload,
): Promise<MediaPlayerConfigResponse> => {
  console.log("[MEDIA API] Requesting Media Player config:", {
    url: api.mediaPlayerConfig,
    payload,
  });

  let response: Response;

  try {
    response = await fetch(api.mediaPlayerConfig, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        outlet_id: payload.outletId,
        batch_number: payload.batchNumber,
        tier: payload.tier,
        orientation: payload.orientation,
      }),
    });
  } catch (error) {
    console.error("[MEDIA API] Network request failed:", error);

    const networkError: any = new Error("Network request failed");

    networkError.code = "NETWORK_ERROR";

    throw networkError;
  }

  console.log("[MEDIA API] HTTP status:", response.status);

  let data: any;

  try {
    data = await response.json();
  } catch (error) {
    console.error("[MEDIA API] Failed to parse response:", error);

    const responseError: any = new Error(
      "Invalid response from Media Player API",
    );

    responseError.code = "INVALID_RESPONSE";

    throw responseError;
  }

  console.log("[MEDIA API] Response:", JSON.stringify(data, null, 2));

  if (response.status === 404) {
    const configurationError: any = new Error(
      data?.error || "No Media Player configuration found",
    );

    configurationError.code = "MEDIA_CONFIGURATION_NOT_FOUND";

    throw configurationError;
  }

  if (!response.ok) {
    const backendError: any = new Error(
      data?.error || `Media Player API failed with HTTP ${response.status}`,
    );

    backendError.code = "BACKEND_ERROR";

    throw backendError;
  }

  if (!data.success) {
    const backendError: any = new Error(
      data?.error || "Media Player configuration request failed",
    );

    backendError.code = "BACKEND_ERROR";

    throw backendError;
  }

  if (!Array.isArray(data.screens) || data.screens.length === 0) {
    const configurationError: any = new Error(
      "No Media Player media is configured",
    );

    configurationError.code = "MEDIA_CONFIGURATION_NOT_FOUND";

    throw configurationError;
  }

  return data;
};

export const fetchMediaPlayerVersion = async (
  payload: MediaPlayerLoginPayload,
): Promise<MediaPlayerVersionResult> => {
  const response = await fetch(api.mediaPlayerVersion, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      outlet_id: payload.outletId,
      batch_number: payload.batchNumber,
      tier: payload.tier,
      orientation: payload.orientation,
    }),
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data?.error || "Failed to check Media Player version");
  }

  return {
    etag: data.etag,
    itemCount: data.itemCount ?? 0,
  };
};

// =============================================================================
// Local metadata
// =============================================================================

const savePreparedPlaylist = async (
  payload: MediaPlayerLoginPayload,
  etag: string,
  items: PlaylistItems[],
  ready: boolean,
): Promise<void> => {
  const meta: PlaylistMeta = {
    outletId: payload.outletId,
    batchNumber: payload.batchNumber,
    tier: payload.tier,
    orientation: payload.orientation,
    etag,
    items,
  };

  await AsyncStorage.multiSet([
    [PLAYLIST_META_KEY, JSON.stringify(meta)],
    [MEDIA_READY_KEY, ready ? "true" : "false"],
  ]);
};

const loadPlaylistMeta = async (): Promise<PlaylistMeta | null> => {
  try {
    const raw = await AsyncStorage.getItem(PLAYLIST_META_KEY);

    if (!raw) {
      return null;
    }

    return JSON.parse(raw);
  } catch (error) {
    console.warn("[MEDIA] Failed to parse playlist metadata", error);
    return null;
  }
};

export const loadAvailablePlaylist = async (): Promise<PlaylistItems[]> => {
  const meta = await loadPlaylistMeta();

  if (!meta || !Array.isArray(meta.items)) {
    return [];
  }

  return meta.items.filter((item) => new File(item.localUri).exists);
};

export const loadPreparedPlaylist = async (): Promise<PlaylistItems[]> => {
  const meta = await loadPlaylistMeta();

  if (!meta || !Array.isArray(meta.items) || meta.items.length === 0) {
    return [];
  }

  const ready = meta.items.every((item) => new File(item.localUri).exists);

  return ready ? meta.items : [];
};

// =============================================================================
// Download state
// =============================================================================

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

// =============================================================================
// Retry state
// =============================================================================

export const getMediaRetryState = async (): Promise<{
  retryCount: number;
  blockedUntil: number;
}> => {
  return {
    retryCount: Number(await AsyncStorage.getItem(MEDIA_RETRY_COUNT_KEY)) || 0,
    blockedUntil:
      Number(await AsyncStorage.getItem(MEDIA_RETRY_BLOCK_UNTIL_KEY)) || 0,
  };
};

export const registerMediaRetryFailure = async (): Promise<{
  retryCount: number;
  blockedUntil: number;
  blocked: boolean;
}> => {
  const state = await getMediaRetryState();
  const now = Date.now();

  if (state.blockedUntil > now) {
    return {
      ...state,
      blocked: true,
    };
  }

  const retryCount = state.retryCount + 1;

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

// =============================================================================
// File download
// =============================================================================

const downloadMediaFile = async (
  item: MediaPlayerConfigItem,
): Promise<string> => {
  const dir = ensurePlaylistDir();
  const filename = getLocalFilename(item.video_uuid, item.object_key);
  const destination = new File(dir, filename);

  if (destination.exists) {
    console.log(`[DOWNLOAD] Already exists: ${filename}`);

    return destination.uri;
  }

  console.log("[DOWNLOAD] Starting:", {
    name: item.video_name,
    objectKey: item.object_key,
    url: item.url,
  });

  const downloaded = await File.downloadFileAsync(
    sanitizeVideoUrl(item.url),
    destination,
  );

  if (!downloaded.exists) {
    throw new Error(`Download completed but file does not exist: ${filename}`);
  }

  console.log(`[DOWNLOAD] Completed: ${item.video_name}`);

  return downloaded.uri;
};

// =============================================================================
// Convert backend config into local item metadata
// =============================================================================

const configToLocalItem = (
  config: MediaPlayerConfigItem,
  localUri: string,
): PlaylistItems => ({
  mediaUuid: config.video_uuid,
  key: config.object_key,
  type: config.type,
  url: config.url,
  localUri,
  fileName: config.video_name,
  frequency: config.frequency,
  startDatetime: config.start_datetime,
  endDatetime: config.end_datetime,
});

const dedupeConfig = (
  items: MediaPlayerConfigItem[],
): MediaPlayerConfigItem[] => {
  const seen = new Set<string>();
  const result: MediaPlayerConfigItem[] = [];

  for (const item of items) {
    if (seen.has(item.video_uuid)) {
      console.warn(
        `[MEDIA] Duplicate media ${item.video_uuid} removed from client config`,
      );
      continue;
    }

    seen.add(item.video_uuid);
    result.push(item);
  }

  return result;
};

// =============================================================================
// Initial Media Player preparation
// =============================================================================

export const prepareMediaPlayerPlaylist = async (
  payload: MediaPlayerLoginPayload,
  onProgress?: (progress: MediaDownloadProgress) => void,
): Promise<PlaylistItems[]> => {
  await clearMediaPlayerCache();

  const response = await fetchMediaPlayerConfig(payload);

  // Persist the backend-resolved outlet name. The Media Player login flow
  // intentionally does not use region as a lookup/display parameter.
  await AsyncStorage.setItem("outlet_name", response.outlet.outlet_name);

  const configItems = dedupeConfig(response.screens);

  if (configItems.length === 0) {
    throw new Error("No Media Player media is configured");
  }

  const total = configItems.length;
  const downloadedItems: PlaylistItems[] = [];

  let firstResolve: ((items: PlaylistItems[]) => void) | null = null;

  let firstReject: ((error: Error) => void) | null = null;

  let firstReady = false;

  const firstMedia = new Promise<PlaylistItems[]>((resolve, reject) => {
    firstResolve = resolve;
    firstReject = reject;
  });

  const downloadRemaining = async () => {
    try {
      await setMediaDownloadState({
        status: "downloading",
        completed: 0,
        total,
        currentFile: "",
      });

      for (let index = 0; index < configItems.length; index++) {
        const item = configItems[index];

        onProgress?.({
          completed: index,
          total,
          currentFile: item.video_name,
        });

        await setMediaDownloadState({
          status: "downloading",
          completed: index,
          total,
          currentFile: item.video_name,
        });

        const localUri = await downloadMediaFile(item);

        downloadedItems.push(configToLocalItem(item, localUri));

        await savePreparedPlaylist(
          payload,
          response.etag,
          [...downloadedItems],
          false,
        );

        await setMediaDownloadState({
          status: "downloading",
          completed: index + 1,
          total,
          currentFile: item.video_name,
        });

        onProgress?.({
          completed: index + 1,
          total,
          currentFile: item.video_name,
        });

        if (!firstReady) {
          firstReady = true;

          console.log(`[MEDIA] First media ready: ${item.video_name}`);

          firstResolve?.([...downloadedItems]);
        }
      }

      await savePreparedPlaylist(payload, response.etag, downloadedItems, true);

      await setMediaDownloadState({
        status: "ready",
        completed: total,
        total,
        currentFile: "",
      });

      await resetMediaRetryState();

      console.log(`[MEDIA] Download complete: ${total}/${total}`);
    } catch (error) {
      console.error("[MEDIA] Background download failed:", error);

      await setMediaDownloadState({
        status: "error",
        completed: downloadedItems.length,
        total,
        currentFile: "",
        error: "Network connectivity issues, please try again",
      });

      if (!firstReady) {
        firstReject?.(
          new Error("Network connectivity issues, please try again"),
        );
      }
    }
  };

  void downloadRemaining();

  return firstMedia;
};

// =============================================================================
// Incremental refresh
// =============================================================================

const getStoredPlayerPayload = async (): Promise<MediaPlayerLoginPayload> => {
  const outletId = await AsyncStorage.getItem("outlet_id");
  const batchNumber = Number(await AsyncStorage.getItem("batch_number")) || 1;
  const tier = (await AsyncStorage.getItem("tier")) || "Tier A";
  const orientation =
    (await AsyncStorage.getItem("orientation")) || "Landscape";

  if (!outletId) {
    throw new Error("No outlet_id available");
  }

  return {
    outletId,
    batchNumber,
    tier,
    orientation: orientation as "Landscape" | "Portrait",
  };
};

export const refreshMediaPlayerPlaylist =
  async (): Promise<PlaylistRefreshResult> => {
    const payload = await getStoredPlayerPayload();
    const state = await getMediaDownloadState();

    // Never race the initial downloader.
    if (state.status === "downloading") {
      return {
        changed: false,
        playlist: await loadAvailablePlaylist(),
        oldFilesToDelete: [],
        etag: null,
      };
    }

    const currentMeta = await loadPlaylistMeta();

    if (!currentMeta) {
      return {
        changed: false,
        playlist: [],
        oldFilesToDelete: [],
        etag: null,
      };
    }

    const version = await fetchMediaPlayerVersion(payload);

    if (version.etag === currentMeta.etag) {
      console.log(
        `[REFRESH] Media Player configuration unchanged — ${version.etag}`,
      );

      return {
        changed: false,
        playlist: await loadAvailablePlaylist(),
        oldFilesToDelete: [],
        etag: version.etag,
      };
    }

    console.log(
      `[REFRESH] Configuration changed: ${currentMeta.etag} → ${version.etag}`,
    );

    const configResponse = await fetchMediaPlayerConfig(payload);
    const configItems = dedupeConfig(configResponse.screens);

    const currentByMediaUuid = new Map(
      currentMeta.items.map((item) => [item.mediaUuid, item]),
    );

    const nextPlaylist: PlaylistItems[] = [];
    const oldFilesToDelete: string[] = [];

    for (const configItem of configItems) {
      const existing = currentByMediaUuid.get(configItem.video_uuid);

      // Same media + same object key + local file exists.
      // This means only schedule/config metadata changed.
      if (
        existing &&
        existing.key === configItem.object_key &&
        new File(existing.localUri).exists
      ) {
        nextPlaylist.push(configToLocalItem(configItem, existing.localUri));

        currentByMediaUuid.delete(configItem.video_uuid);

        continue;
      }

      // New media or replaced object key.
      console.log(
        `[REFRESH] Downloading changed media: ${configItem.video_name}`,
      );

      const localUri = await downloadMediaFile(configItem);

      nextPlaylist.push(configToLocalItem(configItem, localUri));

      if (existing) {
        oldFilesToDelete.push(existing.localUri);
      }

      currentByMediaUuid.delete(configItem.video_uuid);
    }

    // Anything left no longer exists in the Admin configuration.
    for (const oldItem of currentByMediaUuid.values()) {
      oldFilesToDelete.push(oldItem.localUri);
    }

    await savePreparedPlaylist(payload, version.etag, nextPlaylist, true);

    return {
      changed: true,
      playlist: nextPlaylist,
      oldFilesToDelete,
      etag: version.etag,
    };
  };

// =============================================================================
// Playlist deletion / cache
// =============================================================================

export const deletePlaylistFiles = async (
  files: string[],
  activeLocalUri?: string,
): Promise<void> => {
  for (const uri of files) {
    if (!uri || uri === activeLocalUri) {
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

export const clearMediaPlayerCache = async (): Promise<void> => {
  await AsyncStorage.multiRemove([
    PLAYLIST_META_KEY,
    MEDIA_READY_KEY,
    MEDIA_DOWNLOAD_STATE_KEY,
  ]);

  const dir = getPlaylistDir();

  if (dir.exists) {
    dir.delete();
  }

  console.log("[MEDIA] Media Player cache cleared");
};

export const isMediaReady = async (): Promise<boolean> => {
  const ready = await AsyncStorage.getItem(MEDIA_READY_KEY);

  if (ready !== "true") {
    return false;
  }

  return (await loadPreparedPlaylist()).length > 0;
};

// =============================================================================
// Signage compatibility
// =============================================================================

const SIGNAGE_META_KEY = "signage_videos_meta";
const SIGNAGE_DIR = "signage-videos";

interface SignageItem {
  videoURI: string;
  key?: string;
  rotate?: boolean;
  sizeMb?: number;
  optimized?: boolean;
}

interface SignageMeta {
  etag: string;
  outletId: string;
  items: PreparedSignageVideo[];
}

const getSignageDir = (): Directory =>
  new Directory(Paths.document, SIGNAGE_DIR);

const ensureSignageDir = (): Directory => {
  const dir = getSignageDir();
  if (!dir.exists) {
    dir.create();
  }
  return dir;
};

const downloadSignageFile = async (
  url: string,
  key: string,
): Promise<string> => {
  const dir = ensureSignageDir();
  const destination = new File(dir, keyToFilename(key));

  if (destination.exists) {
    return destination.uri;
  }

  const downloaded = await File.downloadFileAsync(
    sanitizeVideoUrl(url),
    destination,
  );

  if (!downloaded.exists) {
    throw new Error(`Signage media download failed: ${key}`);
  }

  return downloaded.uri;
};

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

export const fetchSignageVideos = async (): Promise<SignageItem[]> => {
  const response = await fetch(api.signageVideos);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.message || "Failed to fetch signage videos");
  }

  return data.videos ?? [];
};

export const clearVideoCache = async (): Promise<void> => {
  await AsyncStorage.removeItem(SIGNAGE_META_KEY);

  const dir = getSignageDir();
  if (dir.exists) {
    dir.delete();
  }
};

export const prepareSignageVideos = async (
  outletId: string,
): Promise<PreparedSignageVideo[]> => {
  if (!outletId) {
    throw new Error("No outlet_id");
  }

  console.log("[SIGNAGE] Preparing signage videos...");

  // ---------------------------------------------------------------------------
  // 1. Get current server version
  // ---------------------------------------------------------------------------

  const version = await getSignageVersion();

  if (!version.etag) {
    throw new Error("Could not get signage version");
  }

  // ---------------------------------------------------------------------------
  // 2. Fetch signage media URLs
  // ---------------------------------------------------------------------------

  const videos = await fetchSignageVideos();

  if (videos.length === 0) {
    console.warn("[SIGNAGE] No signage videos found");

    return [];
  }

  console.log(`[SIGNAGE] Found ${videos.length} signage video(s)`);

  // ---------------------------------------------------------------------------
  // 3. Check existing local cache
  // ---------------------------------------------------------------------------

  const currentRaw = await AsyncStorage.getItem(SIGNAGE_META_KEY);

  const current: SignageMeta | null = currentRaw
    ? JSON.parse(currentRaw)
    : null;

  // ---------------------------------------------------------------------------
  // 4. Cache hit
  // ---------------------------------------------------------------------------

  if (current && current.etag === version.etag && current.items.length > 0) {
    const allFilesExist = current.items.every(
      (item) => new File(item.localUri).exists,
    );

    if (allFilesExist) {
      console.log(
        `[SIGNAGE] Cache hit — ${current.items.length} local video(s)`,
      );

      return current.items;
    }

    console.warn(
      "[SIGNAGE] Metadata exists but one or more local files are missing",
    );
  }

  // ---------------------------------------------------------------------------
  // 5. Version changed or first download
  // ---------------------------------------------------------------------------

  if (current) {
    console.log(`[SIGNAGE] Version changed: ${current.etag} → ${version.etag}`);
  } else {
    console.log("[SIGNAGE] No local signage cache — downloading");
  }

  const items: PreparedSignageVideo[] = [];

  // ---------------------------------------------------------------------------
  // 6. Download sequentially
  // ---------------------------------------------------------------------------

  for (const video of videos) {
    const key = video.key || video.videoURI.split("/").pop() || video.videoURI;

    console.log("[SIGNAGE] Preparing:", {
      key,
      url: video.videoURI,
    });

    const localUri = await downloadSignageFile(video.videoURI, key);

    items.push({
      videoURI: video.videoURI,
      localUri,
      key,
      rotate: video.rotate,
      sizeMb: video.sizeMb,
      optimized: video.optimized,
    });
  }

  // ---------------------------------------------------------------------------
  // 7. Save cache metadata
  // ---------------------------------------------------------------------------

  await AsyncStorage.setItem(
    SIGNAGE_META_KEY,
    JSON.stringify({
      etag: version.etag,
      outletId,
      items,
    }),
  );

  console.log(`[SIGNAGE] Download complete — ${items.length}/${videos.length}`);

  return items;
};

export const loadPreparedSignageVideos = async (): Promise<
  PreparedSignageVideo[]
> => {
  try {
    const raw = await AsyncStorage.getItem(SIGNAGE_META_KEY);

    if (!raw) {
      return [];
    }

    const meta = JSON.parse(raw);

    if (!Array.isArray(meta.items)) {
      return [];
    }

    const items = meta.items.filter(
      (item: PreparedSignageVideo) => new File(item.localUri).exists,
    );

    return items;
  } catch (error) {
    console.error("[SIGNAGE] Failed to load prepared videos:", error);

    return [];
  }
};
