const SERVER_URL = "http://10.0.2.2:5000";

export const api = {
  validateOutlet: `${SERVER_URL}/validate_outlet`,
  outletInfo: (outletId: string) => `${SERVER_URL}/outlet_info/${outletId}`,

  heartbeat: `${SERVER_URL}/heartbeat`,

  media: `${SERVER_URL}/get_media`,
  outletImages: `${SERVER_URL}/outlet_image_combined`,

  videos: (outletId: string) => `${SERVER_URL}/videos`,
};
