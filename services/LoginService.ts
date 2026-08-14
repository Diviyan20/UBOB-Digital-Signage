import { api } from "@/components/api/client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { MediaDownloadProgress, prepareMediaPlaylist } from "./MediaService";

export type ScreenType = "signage" | "media";

export type OrientationType = "Landscape" | "Portrait";

export type TierType = "Tier A" | "Tier B";

export type LoginStatus =
  | "loading"
  | "downloading_media"
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
  errorType?: "invalid_outlet" | "network" | "generic";
  error?: string;
  params?: Record<string, string>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validate outlet
// ─────────────────────────────────────────────────────────────────────────────

export const validateOutlet = async (outletId: string) => {
  try {
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

    if (response.status === 404) {
      const error: any = new Error("Invalid Outlet Code");

      error.code = "INVALID_OUTLET";

      throw error;
    }

    if (!response.ok) {
      throw new Error("Network connectivity issues, please try again");
    }

    if (!data.is_valid) {
      const error: any = new Error("Invalid Outlet Code");

      error.code = "INVALID_OUTLET";

      throw error;
    }

    return data;
  } catch (error: any) {
    if (error?.code === "INVALID_OUTLET") {
      throw error;
    }

    throw new Error("Network connectivity issues, please try again");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Sync outlet session
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Save outlet session
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Fetch outlet images
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────────────────────────────────────

export const loginOutlet = async (
  payload: LoginPayload,
  onMediaProgress?: (progress: MediaDownloadProgress) => void,
): Promise<LoginResult> => {
  try {
    const { outletId, screenType, batchNumber, orientation } = payload;

    console.log(`[LOGIN] Validating outlet: ${outletId}`);

    const outletData = await validateOutlet(outletId);

    await syncOutletSession(outletData);

    const dbTier = outletData.tier as TierType;

    // ─────────────────────────────────────────────────────────────────────
    // MEDIA PLAYER
    // ─────────────────────────────────────────────────────────────────────

    if (screenType === "media") {
      console.log("[LOGIN] Media Player selected");

      try {
        await prepareMediaPlaylist(
          outletId,
          batchNumber,
          dbTier,
          orientation,
          onMediaProgress,
        );
      } catch (error: any) {
        console.error("[LOGIN] Initial media download failed:", error);

        return {
          success: false,
          status: "error",
          errorType: "network",
          error: "Network connectivity issues, please try again",
        };
      }

      // Save session as soon as the first media is ready.
      //
      // The remaining files may still be
      // downloading in the background.
      await saveOutletSession(
        outletId,
        outletData.outlet_name,
        outletData.outlet_location,
        screenType,
        batchNumber,
        dbTier,
        orientation,
      );

      console.log("[LOGIN] First media ready. Opening player.");

      return {
        success: true,
        tier: dbTier,
        route: "/screens/PlaylistScreen",
        status: "success",
      };
    }

    // ─────────────────────────────────────────────────────────────────────
    // SIGNAGE SCREEN
    // ─────────────────────────────────────────────────────────────────────

    await saveOutletSession(
      outletId,
      outletData.outlet_name,
      outletData.outlet_location,
      screenType,
      batchNumber,
      dbTier,
      orientation,
    );

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
    console.error("[LOGIN] Login failed:", error);

    if (error?.code === "INVALID_OUTLET") {
      return {
        success: false,
        status: "error",
        errorType: "invalid_outlet",
        error: "Invalid Outlet Code",
      };
    }

    return {
      success: false,
      status: "error",
      errorType: "network",
      error: "Network connectivity issues, please try again",
    };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Offline credentials
// ─────────────────────────────────────────────────────────────────────────────

export const checkOfflineCredentials = async (): Promise<boolean> => {
  try {
    const values = await AsyncStorage.multiGet([
      "saved_outlet",
      "region",
      "screen_type",
      "batch_number",
      "tier",
      "orientation",
    ]);

    const mapped = Object.fromEntries(values);

    const savedOutlet = mapped.saved_outlet
      ? JSON.parse(mapped.saved_outlet)
      : null;

    if (!savedOutlet?.id || !savedOutlet?.name) {
      return false;
    }

    if (!mapped.region) {
      return false;
    }

    if (
      !mapped.screen_type ||
      !["signage", "media"].includes(mapped.screen_type)
    ) {
      return false;
    }

    if (!mapped.batch_number) {
      return false;
    }

    if (!mapped.tier || !["Tier A", "Tier B"].includes(mapped.tier)) {
      return false;
    }

    if (
      !mapped.orientation ||
      !["Landscape", "Portrait"].includes(mapped.orientation)
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Offline login
// ─────────────────────────────────────────────────────────────────────────────

export const offlineLogin = async (): Promise<LoginResult> => {
  const session = await loadOutletSession();

  if (!session) {
    return {
      success: false,
      status: "error",
      errorType: "generic",
      error: "No cached session",
    };
  }

  if (session.screenType === "media") {
    const { isMediaReady } = await import("./MediaService");

    const ready = await isMediaReady();

    if (!ready) {
      return {
        success: false,
        status: "error",
        errorType: "network",
        error: "Media is not fully downloaded",
      };
    }

    return {
      success: true,
      route: "/screens/PlaylistScreen",
      status: "success",
      params: {
        outlet_id: session.outletId,
        batch_number: session.batchNumber.toString(),
        tier: session.tier,
        orientation: session.orientation,
      },
    };
  }

  return {
    success: true,
    route: "/screens/MediaScreen",
    status: "success",
    params: {
      outlet_id: session.outletId,
    },
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Load outlet session
// ─────────────────────────────────────────────────────────────────────────────

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
