import { api } from "@/frontend/components/api/client";
import { File } from "expo-file-system/next";

import {
    clearSignageCache,
    loadPreparedSignageVideos,
    loadSignageMeta,
    saveSignageMeta,
} from "./MediaStorage";

import { downloadSignageFile } from "./MediaDownload";

import type {
    PreparedSignageVideo,
    SignageItem,
    SignageVersion,
} from "./MediaTypes";

// ===============
// SIGNAGE API
// ===============

/*
 * Retrieve the current Signage S3 folder version.
 * This does NOT download media.
 * It only determines whether the cached content is still valid.
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
 * Retrieve the Signage media list.
 *
 * The backend is expected to return CloudFront URLs.
 */
export const fetchSignageVideos = async (): Promise<SignageItem[]> => {
  const response = await fetch(api.signageVideos);

  let data: any;

  try {
    data = await response.json();
  } catch {
    throw new Error("Invalid signage media response");
  }

  if (!response.ok) {
    throw new Error(
      data?.message || data?.error || "Failed to fetch signage videos",
    );
  }

  return data.videos ?? [];
};

// ==============================
// INITIAL SIGNAGE PREPARATION
// ==============================
/**
 * Prepare ALL Signage videos locally.
 *
 * Flow:
 *
 * 1. Get current S3 folder version.
 * 2. Get CloudFront URLs.
 * 3. Check local metadata.
 * 4. If ETag matches and files exist → return cache.
 * 5. Otherwise download every video sequentially.
 * 6. Save local metadata.
 *
 * Unlike Media Player, Signage does not have a user-selected playlist.
 * Every media object under Global/Signage is prepared.
 */
export const prepareSignageVideos = async (
  outletId: string,
): Promise<PreparedSignageVideo[]> => {
  if (!outletId) throw new Error("No Outlet ID");

  console.log("[SIGNAGE] Preparing signage videos...");

  // 1. Get current version
  const version = await getSignageVersion();

  if (!version.etag) throw new Error("Could not get signage version");

  // 2. Get current media list
  const videos = await fetchSignageVideos();

  if (videos.length === 0) {
    console.warn("[SIGNAGE] No signage videos found");
    return [];
  }

  console.log(`[SIGNAGE] Found ${videos.length} signage video(s)`);

  // 3. Check local cache
  const current = await loadSignageMeta();

  // 4. Cache hit
  if (
    current &&
    current.outletId === outletId &&
    current.etag === version.etag &&
    current.items.length > 0
  ) {
    const allFilesExist = current.items.every(
      (item) => new File(item.localUri).exists,
    );

    if (allFilesExist) {
      console.log(
        `[SIGNAGE] Cache hit — ${current.items.length} local video(s)`,
      );
      return current.items;
    }

    console.warn("[SIGNAGE] Metadata exists but local files are missing");
  }

  // 5. Cache miss
  if (current) {
    console.log(`[SIGNAGE] Version changed: ${current.etag} → ${version.etag}`);
  } else {
    console.log("[SIGNAGE] No local cache — downloading");
  }

  const prepared: PreparedSignageVideo[] = [];

  // 6. Download sequentially
  for (const video of videos) {
    const key = video.key || video.videoURI.split("/").pop() || video.videoURI;

    console.log("[SIGNAGE] Preparing:", {
      key,
      url: video.videoURI,
    });

    const localUri = await downloadSignageFile(video.videoURI, key);

    prepared.push({
      videoUri: video.videoURI,
      localUri,
      key,
      rotate: video.rotate,
      sizeMb: video.sizeMb,
      optimized: video.optimized,
    });
  }

  // 7. Save cache metadata
  await saveSignageMeta({
    etag: version.etag,
    outletId,
    items: prepared,
  });

  console.log(
    `[SIGNAGE] Download complete — ${prepared.length}/${videos.length}`,
  );

  return prepared;
};

// =====================
// CLEAR SIGNAGE CACHE
// =====================
export { clearSignageCache };

// ==========================
// LOAD LOCAL SIGNAGE MEDIA
// ==========================
export const getPreparedSignageVideos = async (): Promise<
  PreparedSignageVideo[]
> => {
  return loadPreparedSignageVideos();
};
