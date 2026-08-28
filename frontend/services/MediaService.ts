// =============================================================================
// MediaService.ts
//
// Public API for media functionality.
//
// This file intentionally contains almost no implementation.
//
// Components import from here so they don't need to know how the service
// is internally organized.
//
// Internal implementation lives under:
// services/media/
// =============================================================================

// -----------------------------------------------------------------------------
// Shared types
// -----------------------------------------------------------------------------

export type {
  MediaDownloadProgress, MediaDownloadState, MediaDownloadStatus, MediaFrequency, MediaPlayerConfigItem,
  MediaPlayerConfigResponse,
  MediaPlayerLoginPayload,
  MediaPlayerVersion, MediaType,
  PlaylistItems, PlaylistMeta, PlaylistRefreshResult, PreparedSignageVideo,
  SignageItem, SignageMeta, SignageVersion
} from "./media/MediaTypes";

// -----------------------------------------------------------------------------
// Media Player
// -----------------------------------------------------------------------------

export {
  fetchMediaPlayerConfig,
  fetchMediaPlayerVersion,
  prepareMediaPlayerPlaylist,
  refreshMediaPlayerPlaylist
} from "./media/MediaPlayerService";

// -----------------------------------------------------------------------------
// Media Player local storage
// -----------------------------------------------------------------------------

export {
  clearMediaPlayerCache,
  deletePlaylistFiles, getMediaDownloadState,
  isMediaReady, loadAvailablePlaylist,
  loadPreparedPlaylist
} from "./media/MediaStorage";

// -----------------------------------------------------------------------------
// Retry system
// -----------------------------------------------------------------------------

export {
  getMediaRetryState,
  registerMediaRetryFailure,
  resetMediaRetryState
} from "./media/MediaStorage";

// -----------------------------------------------------------------------------
// Signage
// -----------------------------------------------------------------------------

export {
  clearSignageCache as clearVideoCache, fetchSignageVideos, getSignageVersion, getPreparedSignageVideos as loadPreparedSignageVideos, prepareSignageVideos
} from "./media/SignageService";

// -----------------------------------------------------------------------------
// URL helper
// -----------------------------------------------------------------------------

export { sanitizeMediaUrl as sanitizeVideoUrl } from "./media/MediaDownload";

