import { File } from "expo-file-system/next";
import { ensurePlaylistDir, ensureSignageDir } from "./MediaStorage";
import type { MediaPlayerConfigItem } from "./MediaTypes";

// ==================
// URL HELPERS
// ==================

/*
    * Clean URLs returned by backend

    * This protects the native downloader from accidental whitespace or trailing backslashes
*/
export const sanitizeMediaUrl = (url?: string): string => {
  return (url || "").trim().replace(/\\+$/g, "").replace(/\s+$/g, "");
};

// ==================
// FILENAME HELPERS
// ==================

const keyToFilename = (key: string): string => {
  const filename = key.split("/").pop() || "media";

  return filename.replace(/\s+/g, "-");
};

/**
 * Small deterministic hash.
 *
 * We use this because two different S3 keys may have the same
 * filename. Example:
 *
 * Global/A/video.mp4
 * Global/B/video.mp4
 *
 * Both should not become:
 *
 * video.mp4
 */
const hashString = (value: string): string => {
  let hash = 0;

  for (let index = 0; index < value.length; index++) {
    hash = (hash << 5) - hash + value.charCodeAt(index);

    hash |= 0;
  }

  return Math.abs(hash).toString(16);
};

const getPlaylistFilename = (mediaUuid: string, objectKey: string): string => {
  return [mediaUuid, hashString(objectKey), keyToFilename(objectKey)].join("_");
};

// =======================
// MEDIA PLAYER DOWNLOAD
// =======================

export const downloadMediaPlayerFile = async (
  item: MediaPlayerConfigItem,
): Promise<string> => {
  const dir = ensurePlaylistDir();

  const filename = getPlaylistFilename(item.video_uuid, item.object_key);

  const destination = new File(dir, filename);

  // Avoid re-downloading an existing file
  if (destination.exists) {
    console.log(`[DOWNLOAD] Already exists: ${filename}`);
    return destination.uri;
  }

  const url = sanitizeMediaUrl(item.url);

  if (!url.startsWith("https://")) {
    throw new Error(`Invalid media URL for ${item.video_name}: ${url}`);
  }

  console.log("[DOWNLOAD] Starting:", {
    name: item.video_name,
    objectKey: item.object_key,
    url,
  });

  const downloaded = await File.downloadFileAsync(url, destination);

  if (!downloaded.exists) {
    throw new Error(`Download completed but file does not exist: ${filename}`);
  }

  console.log(`[DOWNLOAD] Completed: ${item.video_name}`);

  return downloaded.uri;
};

// ==================
// SIGNAGE DOWNLOAD
// ==================

export const downloadSignageFile = async (
  url: string,
  key: string,
): Promise<string> => {
  const dir = ensureSignageDir();

  const filename = keyToFilename(key);

  const destination = new File(dir, filename);

  if (destination.exists) {
    console.log(`[SIGNAGE DOWNLOAD] Already exists: ${filename}`);

    return destination.uri;
  }

  const cleanUrl = sanitizeMediaUrl(url);

  if (!cleanUrl.startsWith("https://")) {
    throw new Error(`Invalid signage media URL: ${cleanUrl}`);
  }

  console.log(`[SIGNAGE DOWNLOAD] Starting: ${key}`);

  const downloaded = await File.downloadFileAsync(cleanUrl, destination);

  if (!downloaded.exists) {
    throw new Error(`Signage media download failed: ${key}`);
  }

  console.log(`[SIGNAGE DOWNLOAD] Completed: ${key}`);

  return downloaded.uri;
};
