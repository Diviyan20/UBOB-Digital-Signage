import { api } from "@/components/api/client";
import AsyncStorage from "@react-native-async-storage/async-storage";

const MEDIA_CACHE_KEY = "promotion_media_cache";

export interface MediaItem {
    name?: string;
    description?: string;
    image?: string | null;
    date_start?: string;
    date_end?: string;
  }
  
  interface MediaCache {
    media: MediaItem[];
    cachedAt: number;
  }

  export const fetchPromotions = async (): Promise<MediaItem[]> => {
    try{
        console.log("[PROMOTION FETCH] Requesting promotions...\n");

        const response = await fetch(api.promotions);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

        const data = await response.json();
        const media: MediaItem[] = data.media || [];

        console.log(`[FETCH] Received ${media.length} promotions\n`);

        await AsyncStorage.setItem(
            MEDIA_CACHE_KEY,
            JSON.stringify({
                media,
                cachedAt: Date.now(),
            })
        );

        console.log("[CACHE] Promotions cached locally\n");

        return media;
    }
    catch(err){
        console.error("[FETCH ERROR]", err);

        const cached = await AsyncStorage.getItem(MEDIA_CACHE_KEY);

        if (cached) {
        const parsed: MediaCache = JSON.parse(cached);

        console.log(`[CACHE FALLBACK] Using ${parsed.media.length} cached promotions\n`);
        return parsed.media;
        }
        console.warn("[CACHE FALLBACK] No local cache found\n");

        return [];
    };
  }