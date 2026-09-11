const PRODUCTION_URL =
  "https://wp6gcj3019.execute-api.ap-southeast-5.amazonaws.com";

const DEVELOPMENT_URL =
  "https://kcs4utnpog.execute-api.ap-southeast-5.amazonaws.com";

export const api = {
  validateOutlet: `${PRODUCTION_URL}/validate_outlet`,
  outletInfo: (outletId: string) => `${PRODUCTION_URL}/outlet_info/${outletId}`,
  outletData: `${PRODUCTION_URL}/api/outlets`,
  heartbeat: `${PRODUCTION_URL}/heartbeat`,
  promotions: `${PRODUCTION_URL}/promotions`,
  outletImages: `${PRODUCTION_URL}/outlet_image_combined`,

  // Signage
  signageVideos: `${PRODUCTION_URL}/signage_videos`,
  signageVersion: `${PRODUCTION_URL}/signage_version`,

  // Legacy generic playlist endpoints.
  // Do not use these for the new Media Player runtime.
  playlist: `${PRODUCTION_URL}/playlist`,
  playlistVersion: `${PRODUCTION_URL}/playlist_version`,

  // New Media Player endpoints.
  mediaPlayerConfig: `${PRODUCTION_URL}/outlet-screens/media-player/config`,
  mediaPlayerVersion: `${PRODUCTION_URL}/outlet-screens/media-player/version`,

  config: `${PRODUCTION_URL}/config`,
};
