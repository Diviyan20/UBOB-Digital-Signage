const PRODUCTION_URL =
  "https://wp6gcj3019.execute-api.ap-southeast-5.amazonaws.com";

const DEVELOPMENT_URL =
  "https://kcs4utnpog.execute-api.ap-southeast-5.amazonaws.com";

export const api = {
  validateOutlet: `${DEVELOPMENT_URL}/validate_outlet`,
  outletInfo: (outletId: string) =>
    `${DEVELOPMENT_URL}/outlet_info/${outletId}`,
  outletData: `${DEVELOPMENT_URL}/api/outlets`,
  heartbeat: `${DEVELOPMENT_URL}/heartbeat`,
  promotions: `${DEVELOPMENT_URL}/promotions`,
  outletImages: `${DEVELOPMENT_URL}/outlet_image_combined`,

  // Signage
  signageVideos: `${DEVELOPMENT_URL}/signage_videos`,
  signageVersion: `${DEVELOPMENT_URL}/signage_version`,

  // Legacy generic playlist endpoints.
  // Do not use these for the new Media Player runtime.
  playlist: `${DEVELOPMENT_URL}/playlist`,
  playlistVersion: `${DEVELOPMENT_URL}/playlist_version`,

  // New Media Player endpoints.
  mediaPlayerConfig: `${DEVELOPMENT_URL}/outlet-screens/media-player/config`,
  mediaPlayerVersion: `${DEVELOPMENT_URL}/outlet-screens/media-player/version`,

  config: `${DEVELOPMENT_URL}/config`,
};
