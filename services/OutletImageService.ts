import { api } from "@/components/api/client";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Each image gets its own AsyncStorage key to avoid hitting the 2MB
// per-item limit that some Android implementations enforce
const OUTLET_IMAGE_INDEX_KEY = "outlet_images_index";
const imageKey = (id: string) => `outlet_image_${id}`;

export interface OutletImageItem {
  id: string;
  outlet_name: string;
  dataUri: string; // data:image/png;base64,... — renderable directly by expo-image
}

interface OutletImageIndex {
  ids: string[]; // ordered list of image IDs
  names: Record<string, string>; // id -> outlet_name
  cachedAt: number;
}

/**
 * Saves all images to AsyncStorage.
 * Index stored separately from image data so reads stay fast.
 */
const saveToStorage = async (images: OutletImageItem[]): Promise<void> => {
  const index: OutletImageIndex = {
    ids: images.map((i) => i.id),
    names: Object.fromEntries(images.map((i) => [i.id, i.outlet_name])),
    cachedAt: Date.now(),
  };

  // Write index + all images in one multiSet call
  const pairs: [string, string][] = [
    [OUTLET_IMAGE_INDEX_KEY, JSON.stringify(index)],
    ...images.map((img): [string, string] => [imageKey(img.id), img.dataUri]),
  ];

  await AsyncStorage.multiSet(pairs);
  console.log(`[CACHE] Saved ${images.length} outlet images to AsyncStorage`);
};

/**
 * Loads all outlet images from AsyncStorage.
 * Returns empty array if nothing cached.
 */
export const getCachedOutletImages = async (): Promise<OutletImageItem[]> => {
  try {
    const indexRaw = await AsyncStorage.getItem(OUTLET_IMAGE_INDEX_KEY);
    if (!indexRaw) {
      console.warn("[CACHE] No outlet image index found");
      return [];
    }

    const index: OutletImageIndex = JSON.parse(indexRaw);

    // Fetch all image data in one multiGet call
    const keys = index.ids.map(imageKey);
    const pairs = await AsyncStorage.multiGet(keys);

    const images: OutletImageItem[] = pairs
      .filter(([, value]) => value !== null)
      .map(([key, value]) => {
        const id = key.replace("outlet_image_", "");
        return {
          id,
          outlet_name: index.names[id] || "Unnamed Outlet",
          dataUri: value!,
        };
      });

    console.log(
      `[CACHE] Loaded ${images.length} outlet images from AsyncStorage`,
    );
    return images;
  } catch (err) {
    console.error("[CACHE READ ERROR]", err);
    return [];
  }
};

/**
 * Fetches outlet images from backend.
 * Backend returns image_b64 (optimized 120x120 PNG as base64).
 * Converts to data URIs and saves all to AsyncStorage before returning.
 * ALL images saved before returning — no partial renders.
 */
export const fetchAndCacheOutletImages = async (
  endpoint: string = api.outletImages,
): Promise<OutletImageItem[]> => {
  console.log("[OUTLET IMAGE FETCH] Fetching from backend...");

  const outletId = await AsyncStorage.getItem("outlet_id");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ outlet_id: outletId }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();
  const rawItems: { id: string; outlet_name: string; image_b64: string }[] =
    Array.isArray(data?.media) ? data.media : [];

  console.log(`[FETCH] Received ${rawItems.length} outlet images`);

  // Convert base64 strings to data URIs
  const images: OutletImageItem[] = rawItems.map((item) => ({
    id: item.id,
    outlet_name: item.outlet_name,
    dataUri: `data:image/png;base64,${item.image_b64}`,
  }));

  // Save all to AsyncStorage before returning
  await saveToStorage(images);

  return images;
};
