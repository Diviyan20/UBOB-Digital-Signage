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
  signageVideos: `${PRODUCTION_URL}/signage_videos`,
  playlist: `${PRODUCTION_URL}/playlist`,
  playlistVersion: `${PRODUCTION_URL}/playlist_version`,
  signageVersion: `${PRODUCTION_URL}/signage_version`,
  signageStatus: `${PRODUCTION_URL}/signage_status`,
};

export const config = `${PRODUCTION_URL}/config`;
