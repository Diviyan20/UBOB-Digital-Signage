import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, File, Paths } from "expo-file-system/next";
import type {
  MediaDownloadState,
  PlaylistItems,
  PlaylistMeta,
  SignageMeta,
} from "./MediaTypes";

/*
    ================
    STORAGE KEYS
    ================

    * Only this file knows the AsyncStorage keys
    * That means you don't end up with:
        - "playlist_meta"
        - "playlistMeta"
        - "media_playlist_meta"

        scattered through the application
*/

export const STORAGE_KEYS = {
  playlistMeta: "playlist_meta",
  mediaReady: "media_ready",
  mediaDownloadState: "media_download_state",

  retryCount: "media_retry_count",
  retryBlockedUntil: "media_retry_block_until",

  signageMeta: "signage_videos_meta",

  outletId: "outlet_id",
  outletName: "outlet_name",
  batchNumber: "batch_number",
  tier: "tier",
  orientation: "orientation",
} as const;

// =================
// DIRECTORY NAMES
// =================
const PLAYLIST_DIRECTORY = "playlist";
const SIGNAGE_DIRECTORY = "signage-videos";

// =====================
// RETRY CONFIGURATION
// =====================
export const MAX_MEDIA_RETRIES = 5;
export const MEDIA_RETRY_COOLDOWN = 5 * 60 * 1000;

// ================
// GENERIC HELPERS
// ================

export const getPlaylistDir = (): Directory =>
  new Directory(Paths.document, PLAYLIST_DIRECTORY);

export const ensurePlaylistDir = (): Directory => {
  const dir = getPlaylistDir();

  if (!dir.exists) {
    dir.create();
    console.log("[FS] Created playlist directory");
  }

  return dir;
};

export const getSignageDir = (): Directory =>
  new Directory(Paths.document, SIGNAGE_DIRECTORY);

export const ensureSignageDir = (): Directory => {
  const dir = getSignageDir();

  if (!dir.exists) {
    dir.create();
    console.log("[FS] Created signage directory");
  }

  return dir;
};

// ==============================
// GENERIC FILESYSTEM DELETION
// ==============================

export const deleteFileIfExists = (uri: string): void => {
  if (!uri) return;

  try {
    const file = new File(uri);

    if (file.exists) {
      file.delete();
      console.log(`[FS] Deleted: ${uri}`);
    }
  } catch (error) {
    console.warn(`[FS] Failed to delete: ${uri}`, error);
  }
};

// ===================
// PLAYLIST METADATA
// ===================

export const savePlaylistMeta = async (
  meta: PlaylistMeta,
  ready: boolean,
): Promise<void> => {
  await AsyncStorage.multiSet([
    [STORAGE_KEYS.playlistMeta, JSON.stringify(meta)],

    [STORAGE_KEYS.mediaReady, ready ? "true" : "false"],
  ]);

  console.log(
    `[MEDIA] Saved playlist metadata — ${meta.items.length} item(s), ready=${ready}`,
  );
};

export const loadPlaylistMeta = async (): Promise<PlaylistMeta | null> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.playlistMeta);

    if (!raw) return null;

    return JSON.parse(raw);
  } catch (error) {
    console.warn("[MEDIA] Failed to parse playlist metadata:", error);
    return null;
  }
};

// ===============================
// AVAILABLE / COMPLETE PLAYLIST
// ===============================

export const loadAvailablePlaylist = async (): Promise<PlaylistItems[]> => {
  const meta = await loadPlaylistMeta();

  if (!meta || !Array.isArray(meta.items)) {
    return [];
  }

  return meta.items.filter((item) => new File(item.localUri).exists);
};

export const loadPreparedPlaylist = async (): Promise<PlaylistItems[]> => {
  const meta = await loadPlaylistMeta();

  if (!meta || !Array.isArray(meta.items) || meta.items.length === 0) return [];

  const allFilesExist = meta.items.every(
    (item) => new File(item.localUri).exists,
  );

  if (!allFilesExist) {
    console.warn("[MEDIA] Playlist exists but one or more files are missing");
    return [];
  }

  return meta.items;
};

// ====================
// DOWNLOAD STATE
// ====================

export const setMediaDownloadState = async (
  state: MediaDownloadState,
): Promise<void> => {
  await AsyncStorage.setItem(
    STORAGE_KEYS.mediaDownloadState,
    JSON.stringify(state),
  );
};

export const getMediaDownloadState = async (): Promise<MediaDownloadState> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.mediaDownloadState);

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

// ========================
// MEDIA PLAYER READINESS
// ========================

export const isMediaReady = async (): Promise<boolean> => {
  const ready = await AsyncStorage.getItem(STORAGE_KEYS.mediaReady);

  if (ready !== "true") {
    return false;
  }

  return (await loadPreparedPlaylist()).length > 0;
};

// =====================
// MEDIA PLAYER CACHE
// =====================

export const clearMediaPlayerCache = async (): Promise<void> => {
  await AsyncStorage.multiRemove([
    STORAGE_KEYS.playlistMeta,
    STORAGE_KEYS.mediaReady,
    STORAGE_KEYS.mediaDownloadState,
  ]);

  const dir = getPlaylistDir();

  if (dir.exists) {
    dir.delete();
    console.log("[FS] Playlist directory deleted");
  }

  console.log("[MEDIA] Media Player cache cleared");
};

// ================================
// DELETE OBSOLETE PLAYLIST FILES
// ================================

export const deletePlaylistFiles = async (
  files: string[],
  activeLocalUri?: string,
): Promise<void> => {
  for (const uri of files) {
    if (!uri) continue;

    // Never delete the file currently being played
    if (uri === activeLocalUri) {
      console.log(`[CLEANUP] Keeping active file: ${uri}`);
      continue;
    }

    deleteFileIfExists(uri);
  }
};

// ===============
// RETRY STATE
// ===============

export const getMediaRetryState = async (): Promise<{
  retryCount: number;
  blockedUntil: number;
}> => {
  return {
    retryCount:
      Number(await AsyncStorage.getItem(STORAGE_KEYS.retryCount)) || 0,

    blockedUntil:
      Number(await AsyncStorage.getItem(STORAGE_KEYS.retryBlockedUntil)) || 0,
  };
};

export const registerMediaRetryFailure = async (): Promise<{
  retryCount: number;
  blockedUntil: number;
  blocked: boolean;
}> => {
  const state = await getMediaRetryState();

  const now = Date.now();

  // Existing cooldown is still active
  if (state.blockedUntil > now) {
    return {
      ...state,
      blocked: true,
    };
  }

  const retryCount = state.retryCount + 1;

  // Fifth failure activates cooldown
  if (retryCount >= MAX_MEDIA_RETRIES) {
    const blockedUntil = now + MEDIA_RETRY_COOLDOWN;

    await AsyncStorage.multiSet([
      [STORAGE_KEYS.retryCount, "0"],
      [STORAGE_KEYS.retryBlockedUntil, blockedUntil.toString()],
    ]);

    return {
      retryCount,
      blockedUntil,
      blocked: true,
    };
  }

  await AsyncStorage.setItem(STORAGE_KEYS.retryCount, retryCount.toString());

  return {
    retryCount,
    blockedUntil: 0,
    blocked: false,
  };
};

export const resetMediaRetryState = async (): Promise<void> => {
  await AsyncStorage.multiRemove([
    STORAGE_KEYS.retryCount,
    STORAGE_KEYS.retryBlockedUntil,
  ]);
};

// ==================
// SIGNAGE METADATA
// ==================

export const saveSignageMeta = async (meta: SignageMeta): Promise<void> => {
  await AsyncStorage.setItem(STORAGE_KEYS.signageMeta, JSON.stringify(meta));
};

export const loadSignageMeta = async (): Promise<SignageMeta | null> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.signageMeta);

    if (!raw) return null;

    return JSON.parse(raw);
  } catch (error) {
    console.warn("[SIGNAGE] Failed to parse signage metadata:", error);
    return null;
  }
};

export const loadPreparedSignageVideos = async () => {
  const meta = await loadSignageMeta();

  if (!meta || !Array.isArray(meta.items)) {
    return [];
  }

  return meta.items.filter((item) => new File(item.localUri).exists);
};

// ===============
// SIGNAGE CACHE
// ===============

export const clearSignageCache = async (): Promise<void> => {
  await AsyncStorage.removeItem(STORAGE_KEYS.signageMeta);

  const dir = getSignageDir();

  if (dir.exists) {
    dir.delete();
    console.log("[FS] Signage directory deleted");
  }

  console.log("[SIGNAGE] Cache cleared");
};

// ================
// SESSION VALUES
// ================

export const saveOutletName = async (outletName: string): Promise<void> => {
  await AsyncStorage.setItem(STORAGE_KEYS.outletName, outletName);
};

export const getStoredPlayerPayloadValues = async () => {
  const outletId = await AsyncStorage.getItem(STORAGE_KEYS.outletId);

  const batchNumber =
    Number(await AsyncStorage.getItem(STORAGE_KEYS.batchNumber)) || 1;

  const tier = (await AsyncStorage.getItem(STORAGE_KEYS.tier)) || "Tier A";

  const orientation =
    (await AsyncStorage.getItem(STORAGE_KEYS.orientation)) || "Landscape";

  return {
    outletId,
    batchNumber,
    tier,
    orientation,
  };
};
