import { api } from "@/components/api/client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  MediaDownloadProgress,
  MediaPlayerLoginPayload,
  prepareMediaPlayerPlaylist,
} from "./MediaService";

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
  errorType?: "invalid_outlet" | "network" | "configuration" | "generic";
  error?: string;
  params?: Record<string, string>;
}

// =============================================================================
// Outlet validation
// =============================================================================

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

    if (response.status === 404 || !data.is_valid) {
      const error: any = new Error("Invalid Outlet Code");
      error.code = "INVALID_OUTLET";
      throw error;
    }

    if (!response.ok) {
      throw new Error("Network connectivity issues, please try again");
    }

    return data;
  } catch (error: any) {
    if (error?.code === "INVALID_OUTLET") {
      throw error;
    }

    throw new Error("Network connectivity issues, please try again");
  }
};

// =============================================================================
// Session
// =============================================================================

export const saveOutletSession = async (
  outletId: string,
  outletName: string,
  screenType: ScreenType,
  batchNumber: number,
  tier: TierType,
  orientation: OrientationType,
  outletLocation?: string,
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
      batchNumber: parseInt(mapped.batch_number || "1", 10),
      tier: (mapped.tier as TierType) || "Tier A",
      orientation: (mapped.orientation as OrientationType) || "Landscape",
    };
  } catch (error) {
    console.error("Failed to load outlet session:", error);
    return null;
  }
};

// =============================================================================
// Signage promotions
// =============================================================================

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

// =============================================================================
// Login
// =============================================================================

export const loginOutlet = async (
  payload: LoginPayload,
  onMediaProgress?: (progress: MediaDownloadProgress) => void,
): Promise<LoginResult> => {
  try {
    const { outletId, screenType, batchNumber, tier, orientation } = payload;

    // -----------------------------------------------------------------------
    // SIGNAGE
    // -----------------------------------------------------------------------

    if (screenType === "signage") {
      const outletData = await validateOutlet(outletId);

      await saveOutletSession(
        outletId,
        outletData.outlet_name,
        screenType,
        batchNumber,
        outletData.tier as TierType,
        orientation,
        outletData.outlet_location,
      );

      return {
        success: true,
        tier: outletData.tier as TierType,
        route: "/screens/MediaScreen",
        status: "success",
      };
    }

    // -----------------------------------------------------------------------
    // MEDIA PLAYER
    // -----------------------------------------------------------------------

    console.log("[LOGIN] Media Player selected — resolving outlet_screens");

    const playerPayload: MediaPlayerLoginPayload = {
      outletId,
      batchNumber,
      tier,
      orientation,
    };

    try {
      await prepareMediaPlayerPlaylist(playerPayload, onMediaProgress);
    } catch (error: any) {
      console.error("[LOGIN] Media Player preparation failed:", error);

      const code = error?.code;

      const message = error?.message || "Media Player preparation failed";

      if (code === "MEDIA_CONFIGURATION_NOT_FOUND") {
        return {
          success: false,
          status: "error",
          errorType: "configuration",
          error: message,
        };
      }

      if (code === "NETWORK_ERROR") {
        return {
          success: false,
          status: "error",
          errorType: "network",
          error: "Network connectivity issues, please try again",
        };
      }

      // Backend/SQL/configuration failure.
      // Do NOT pretend this is a Wi-Fi problem.
      return {
        success: false,
        status: "error",
        errorType: "configuration",
        error: message,
      };
    }

    // The backend has already validated the outlet/tier against DB and
    // prepareMediaPlayerPlaylist stored the authoritative outlet name.
    const outletName = (await AsyncStorage.getItem("outlet_name")) || outletId;

    await saveOutletSession(
      outletId,
      outletName,
      screenType,
      batchNumber,
      tier,
      orientation,
    );

    console.log("[LOGIN] First Media Player media ready. Opening player.");

    return {
      success: true,
      tier,
      route: "/screens/PlaylistScreen",
      status: "success",
    };
  } catch (error: any) {
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

// =============================================================================
// Offline login
// =============================================================================

export const checkOfflineCredentials = async (): Promise<boolean> => {
  try {
    const values = await AsyncStorage.multiGet([
      "saved_outlet",
      "screen_type",
      "batch_number",
      "tier",
      "orientation",
    ]);

    const mapped = Object.fromEntries(values);

    const savedOutlet = mapped.saved_outlet
      ? JSON.parse(mapped.saved_outlet)
      : null;

    return Boolean(
      savedOutlet?.id &&
      savedOutlet?.name &&
      mapped.screen_type &&
      ["signage", "media"].includes(mapped.screen_type) &&
      mapped.batch_number &&
      mapped.tier &&
      ["Tier A", "Tier B"].includes(mapped.tier) &&
      mapped.orientation &&
      ["Landscape", "Portrait"].includes(mapped.orientation),
    );
  } catch {
    return false;
  }
};

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

    if (!(await isMediaReady())) {
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
