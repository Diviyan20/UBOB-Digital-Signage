const SERVER_URL =
  "https://wp6gcj3019.execute-api.ap-southeast-5.amazonaws.com";

export const api = {
  validateOutlet: `${SERVER_URL}/validate_outlet`,
  outletInfo: (outletId: string) => `${SERVER_URL}/outlet_info/${outletId}`,
  outletData: `${SERVER_URL}/api/outlets`,
  heartbeat: `${SERVER_URL}/heartbeat`,
  media: `${SERVER_URL}/get_media`,
  outletImages: `${SERVER_URL}/outlet_image_combined`,
  videos: `${SERVER_URL}/videos`,
};
