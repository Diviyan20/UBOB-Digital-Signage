import { api } from "@/components/api/client";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type ScreenType = "signage" | "media";
export type OrientationType = "Landscape" | "Portrait";
export type TierType = "Tier A" | "Tier B";

export type LoginStatus =
  | "loading"
  | "fetching_promotions"
  | "preloading_images"
  | "success"
  | "error";

export interface LoginPayload {
  outletId: string;
  screenType: ScreenType;
  batchNumber: number;
  tier: TierType;
  orientation: OrientationType;
}

export interface LoginResult {
  success: boolean;
  route?: string;
  preloadImages?: any[];
  status?: LoginStatus;
  tier?: TierType;
  error?: string;
}

/*
 * Validate whether outlet ID exists in the database
 */
export const validateOutlet = async (outletId: string) => {
  const response = await fetch(api.validateOutlet, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      outlet_id: outletId,
    }),
  });

  const data = await response.json();

  if (!response.ok || !data.is_valid) {
    throw new Error("Invalid outlet");
  }
  return data;
};

export const syncOutletSession = async (outletData: any) => {
  const values = await AsyncStorage.multiGet([
    "saved_outlet",
    "region",
    "tier",
  ]);

  const mapped = Object.fromEntries(values);

  const savedOutlet = mapped.saved_outlet
    ? JSON.parse(mapped.saved_outlet)
    : null;

  const needsUpdate =
    !savedOutlet ||
    savedOutlet.name !== outletData.outlet_name ||
    mapped.region !== outletData.outlet_location ||
    mapped.tier !== outletData.tier;

  if (!needsUpdate) {
    return false;
  }

  await AsyncStorage.multiSet([
    [
      "saved_outlet",
      JSON.stringify({
        id: outletData.outlet_id,
        name: outletData.outlet_name,
      }),
    ],
    ["region", outletData.outlet_location],
    ["tier", outletData.tier],
  ]);

  return true;
};

/*
 * Save outlet information in memory (Used for easier login on next boot)
 */
export const saveOutletSession = async (
  outletId: string,
  outletName: string,
  outletLocation: string,
  screenType: ScreenType,
  batchNumber: number,
  tier: TierType,
  orientation: OrientationType,
) => {
  await AsyncStorage.multiSet([
    [
      "saved_outlet",
      JSON.stringify({
        id: outletId,
        name: outletName,
      }),
    ],
    ["outlet_id", outletId],
    ["region", outletLocation ?? ""],
    ["screen_type", screenType],
    ["batch_number", batchNumber.toString()],
    ["tier", tier],
    ["orientation", orientation],
  ]);
};

/*
 * Fetches outlet images and their names to display in media screen
 */
export const fetchOutletImages = async (outletId: string) => {
  const response = await fetch(api.outletImages, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      outlet_id: outletId,
    }),
  });

  const data = await response.json();
  return data.media || [];
};

export const loginOutlet = async (
  payload: LoginPayload,
): Promise<LoginResult> => {
  try {
    const { outletId, screenType, batchNumber, tier, orientation } = payload;

    const outletData = await validateOutlet(outletId);

    await syncOutletSession(outletData);

    const dbTier = outletData.tier as TierType;

    await saveOutletSession(
      outletId,
      outletData.outlet_name,
      outletData.outlet_location,
      screenType,
      batchNumber,
      outletData.tier,
      orientation,
    );

    // MEDIA PLAYER FLOW
    if (screenType === "media") {
      return {
        success: true,
        tier: dbTier,
        route: "/screens/PlaylistScreen",
        status: "success",
      };
    }

    // SIGNAGE FLOW
    const promotions = await fetchOutletImages(outletId);
    if (promotions.length === 0) {
      return {
        success: true,
        tier: dbTier,
        route: "/screens/MediaScreen",
        status: "error",
      };
    }

    return {
      success: true,
      preloadImages: promotions,
      status: "preloading_images",
    };
  } catch (error: any) {
    return {
      success: false,
      status: "error",
      error: error?.message || "Login failed",
    };
  }
};

/*
 * Load saved outlet session from AsyncStorage
 */
export const loadOutletSession = async () => {
  try {
    const values = await AsyncStorage.multiGet([
      "saved_outlet",
      "outlet_id",
      "screen_type",
      "batch_number",
      "tier",
      "orientation",
      "region",
    ]);

    const mapped = Object.fromEntries(values);

    const savedOutlet = mapped.saved_outlet
      ? JSON.parse(mapped.saved_outlet)
      : null;

    return {
      savedOutlet,
      outletId: mapped.outlet_id || "",
      region: mapped.region || "",
      screenType: (mapped.screen_type as ScreenType) || "signage",
      batchNumber: parseInt(mapped.batch_number || "1"),
      tier: (mapped.tier as TierType) || "Tier A",
      orientation: (mapped.orientation as OrientationType) || "Landscape",
    };
  } catch (error) {
    console.error("Failed to load outlet session:", error);
    return null;
  }
};
