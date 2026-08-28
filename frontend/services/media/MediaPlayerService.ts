import { api } from "@/frontend/components/api/client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { File } from "expo-file-system/next";

import {
    clearMediaPlayerCache,
    deletePlaylistFiles,
    getMediaDownloadState,
    getStoredPlayerPayloadValues,
    loadAvailablePlaylist,
    loadPlaylistMeta,
    resetMediaRetryState,
    saveOutletName,
    savePlaylistMeta,
    setMediaDownloadState,
} from "./MediaStorage";

import { downloadMediaPlayerFile } from "./MediaDownload";

import { MediaPlayerVersion } from "../MediaService";
import type {
    MediaDownloadProgress,
    MediaPlayerConfigItem,
    MediaPlayerConfigResponse,
    MediaPlayerLoginPayload,
    PlaylistItems,
    PlaylistRefreshResult,
} from "./MediaTypes";

/*
    =========
    API
    =========
    * Fetch the complete Media Player configuration.
    * The backend is responsible for:
        - finding the outlet
        - finding matching outlet_screens
        - resolving media_library.object_key
        - generating the CloudFront URL
        - returning schedule information
*/

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

    const networkError: any = new Error("Network request failed.");

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

/*
 * Fetch only the current Media Player version.
 * This endpoint is intentionally cheaper than fetching the whole
 * configuration. It is used periodically while the player is running.
 */

export const fetchMediaPlayerVersion = async (
  payload: MediaPlayerLoginPayload,
): Promise<MediaPlayerVersion> => {
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

  let data: any;

  try {
    data = await response.json();
  } catch {
    throw new Error("Invalid Media Player version response");
  }

  if (!response.ok || !data.success) {
    throw new Error(data?.error || "Failed to check Media Player version");
  }

  return {
    etag: data.etag,
    itemCount: data.itemCount ?? 0,
  };
};

// ================
// NORMALIZATION
// ================

// Convert backend configuration into the structure used by the player.

const toPlaylistItem = (
  item: MediaPlayerConfigItem,
  localUri: string,
): PlaylistItems => {
  return {
    mediaUuid: item.video_uuid,
    key: item.object_key,
    type: item.type,
    url: item.url,
    localUri,
    fileName: item.video_name,
    frequency: item.frequency,
    startDatetime: item.start_datetime,
    endDatetime: item.end_datetime,
  };
};

/**
 * Prevent the same media UUID from appearing multiple times.
 *
 * Admin configuration order is preserved.
 */

const dedupeConfig = (
  items: MediaPlayerConfigItem[],
): MediaPlayerConfigItem[] => {
  const seen = new Set<string>();

  const result: MediaPlayerConfigItem[] = [];

  for (const item of items) {
    if (seen.has(item.video_uuid)) {
      console.warn(`[MEDIA] Duplicate media ${item.video_uuid} removed`);
      continue;
    }

    seen.add(item.video_uuid);

    result.push(item);
  }

  return result;
};

// ======================
// INITIAL PREPARATION
// ======================
/**
 * Prepare the Media Player's local media.
 *
 * Strategy:
 *
 * 1. Clear the previous Media Player cache.
 * 2. Ask backend which media belongs to this TV.
 * 3. Download media sequentially.
 * 4. Save each successful download immediately.
 * 5. Resolve once the FIRST media is ready.
 * 6. Continue downloading the remaining media in the background.
 *
 * This keeps login fast without sacrificing local playback.
 */

export const prepareMediaPlayerPlaylist = async (
  payload: MediaPlayerLoginPayload,
  onProgress?: (progress: MediaDownloadProgress) => void,
): Promise<PlaylistItems[]> => {
  await clearMediaPlayerCache();

  const response = await fetchMediaPlayerConfig(payload);

  await saveOutletName(response.outlet.outlet_name);

  const items = dedupeConfig(response.screens);

  if (items.length === 0)
    throw new Error("No Media Player media is configured");

  const total = items.length;

  const downloadedItems: PlaylistItems[] = [];

  let resolveFirst: ((items: PlaylistItems[]) => void) | null = null;

  let rejectFirst: ((error: Error) => void) | null = null;

  let firstReady = false;

  const firstMediaReady = new Promise<PlaylistItems[]>((resolve, reject) => {
    resolveFirst = resolve;

    rejectFirst = reject;
  });

  const downloadRemaining = async (): Promise<void> => {
    try {
      await setMediaDownloadState({
        status: "downloading",
        completed: 0,
        total,
        currentFile: "",
      });

      for (let index = 0; index < items.length; index++) {
        const item = items[index];

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

        console.log(
          `[MEDIA] Downloading ${index + 1}/${total}: ${item.video_name}`,
        );

        const localUri = await downloadMediaPlayerFile(item);

        const playlistItem = toPlaylistItem(item, localUri);

        downloadedItems.push(playlistItem);

        // Save immediately.
        //
        // This allows PlaylistComponent to discover media while
        // the rest of the playlist is still downloading.
        await savePlaylistMeta(
          {
            outletId: payload.outletId,
            batchNumber: payload.batchNumber,
            tier: payload.tier,
            orientation: payload.orientation,
            etag: response.etag,
            items: [...downloadedItems],
          },
          false,
        );

        onProgress?.({
          completed: index + 1,
          total,
          currentFile: item.video_name,
        });

        await setMediaDownloadState({
          status: "downloading",
          completed: index + 1,
          total,
          currentFile: item.video_name,
        });

        // First successful media means login can continue.
        if (!firstReady) {
          firstReady = true;
          console.log(`[MEDIA] First media ready: ${item.video_name}`);

          resolveFirst?.([...downloadedItems]);
        }
      }

      // Everything finished.
      await savePlaylistMeta(
        {
          outletId: payload.outletId,
          batchNumber: payload.batchNumber,
          tier: payload.tier,
          orientation: payload.orientation,
          etag: response.etag,
          items: downloadedItems,
        },
        true,
      );

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

      // If the very first file failed,
      // login must fail as well.
      if (!firstReady) {
        rejectFirst?.(
          new Error("Network connectivity issues, please try again"),
        );
      }
    }
  };

  // Important:
  // Don't await the full download.
  void downloadRemaining();

  return firstMediaReady;
};

// ======================
// INCREMENTAL REFRESH
// ======================
/**
 * Retrieve the Media Player configuration values saved during login.
 *
 * The Media Player screen uses these to ask the backend for
 * future version/configuration changes.
 */

const getStoredPlayerPayload = async (): Promise<MediaPlayerLoginPayload> => {
  const values = await getStoredPlayerPayloadValues();

  if (!values.outletId) throw new Error("No outlet ID available.");

  return {
    outletId: values.outletId,
    batchNumber: values.batchNumber,
    tier: values.tier,
    orientation: values.orientation as "Landscape" | "Portrait",
  };
};

/**
 * Refresh an already prepared Media Player playlist.
 *
 * Important distinction:
 *
 * - Version endpoint tells us whether Admin configuration changed.
 * - Config endpoint tells us what the new configuration is.
 * - Existing local files are reused whenever possible.
 *
 * Therefore changing a schedule does NOT cause the video to download again.
 */

export const refreshMediaPlayerPlaylist =
  async (): Promise<PlaylistRefreshResult> => {
    const payload = await getStoredPlayerPayload();

    const downloadState = await getMediaDownloadState();

    // Never modify the playlist while initial preparation is running.
    if (downloadState.status === "downloading") {
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

    // Nothing changed
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

      /*
            * Same UUID + same object key + local file exists

            * We can reuse the existing file
            * Schedule changes are handled
        */
      if (
        existing &&
        existing.key === configItem.object_key &&
        new File(existing.localUri).exists
      ) {
        nextPlaylist.push(toPlaylistItem(configItem, existing.localUri));

        currentByMediaUuid.delete(configItem.video_uuid);
        continue;
      }

      // New media or changed S3 object
      console.log(
        `[REFRESH] Downloading changed media: ${configItem.video_name}`,
      );

      const localUri = await downloadMediaPlayerFile(configItem);

      nextPlaylist.push(toPlaylistItem(configItem, localUri));

      if (existing) {
        oldFilesToDelete.push(existing.localUri);
      }

      currentByMediaUuid.delete(configItem.video_uuid);
    }

    // Anything remaining was removed from Admin
    for (const oldItem of currentByMediaUuid.values()) {
      oldFilesToDelete.push(oldItem.localUri);
    }

    await savePlaylistMeta(
      {
        outletId: payload.outletId,
        batchNumber: payload.batchNumber,
        tier: payload.tier,
        orientation: payload.orientation,
        etag: version.etag,
        items: nextPlaylist,
      },
      true,
    );

    console.log(`[REFRESH] Playlist updated — ${nextPlaylist.length} item(s)`);

    return {
      changed: true,
      playlist: nextPlaylist,
      oldFilesToDelete,
      etag: version.etag,
    };
  };

// Keep delete exposed from one place for the existing player
export { deletePlaylistFiles };

/*
    AsyncStorage session helper kept here so callers can still rely on the 
    same MediaService import surface
*/
export const getMediaPlayerSession = async () => {
  const outletId = await AsyncStorage.getItem("outlet_id");

  return { outletId };
};
