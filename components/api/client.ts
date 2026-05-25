const PRODUCTION_URL =
  "https://wp6gcj3019.execute-api.ap-southeast-5.amazonaws.com";

const DEVELOPMENT_URL = "https://kcs4utnpog.execute-api.ap-southeast-5.amazonaws.com"

export const api = {
  validateOutlet: `${DEVELOPMENT_URL}/validate_outlet`,
  outletInfo: (outletId: string) => `${DEVELOPMENT_URL}/outlet_info/${outletId}`,
  outletData: `${DEVELOPMENT_URL}/api/outlets`,
  heartbeat: `${DEVELOPMENT_URL}/heartbeat`,
  promotions: `${DEVELOPMENT_URL}/promotions`,
  outletImages: `${DEVELOPMENT_URL}/outlet_image_combined`,
  signageVideos: `${DEVELOPMENT_URL}/signage_videos`,
  mixedMedia: `${DEVELOPMENT_URL}/get_mixed_media`
};

export const config = `${DEVELOPMENT_URL}/config`;