import { api } from "@/components/api/client";
import AsyncStorage from "@react-native-async-storage/async-storage";

const MEDIA_CACHE_KEY = "promotion_media_cache";
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 mins

export interface MediaItem {
  name?: string;
  description?: string;
  image?: string | null;
  date_start?: string;
  date_end?: string;
  localFallback?: any;
}

interface MediaCache {
  media: MediaItem[];
  cachedAt: number;
}

export const fetchPromotions = async (): Promise<MediaItem[]> => {
  try {
    const cached = await AsyncStorage.getItem(MEDIA_CACHE_KEY);

    if (cached) {
      const parsed: MediaCache = JSON.parse(cached);

      const cacheAge = Date.now() - parsed.cachedAt;

      if (cacheAge < CACHE_TTL_MS) {
        console.log(`[CACHE HIT] Promotions (${parsed.media.length})`);
        return parsed.media;
      }
    }
    console.log("[PROMOTION FETCH] Requesting promotions...\n");

    const response = await fetch(api.promotions);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    const media: MediaItem[] = data.media || [];

    await AsyncStorage.setItem(
      MEDIA_CACHE_KEY,
      JSON.stringify({
        media,
        cachedAt: Date.now(),
      }),
    );

    console.log(`[CACHE SAVE] ${media.length} promotions`);

    return media;
  } catch (err) {
    console.error("[FETCH ERROR]", err);

    const cached = await AsyncStorage.getItem(MEDIA_CACHE_KEY);

    if (cached) {
      const parsed: MediaCache = JSON.parse(cached);

      console.log(
        `[CACHE FALLBACK] Using ${parsed.media.length} cached promotions\n`,
      );
      return parsed.media;
    }
    console.warn("[CACHE FALLBACK] No local cache found\n");

    return [];
  }
};
