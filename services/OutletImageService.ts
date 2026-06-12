import { api } from "@/components/api/client";
import AsyncStorage from "@react-native-async-storage/async-storage";

const OUTLET_IMAGE_CACHE_KEY = "outlet_images_cache";

export interface OutletImageItem {
    id?: string;
    image?: string | null;
    outlet_name?: string;
    outlet_id?: string;
  }
  
  interface OutletImageCache {
    images: OutletImageItem[];
    cachedAt: number;
  }

  export const fetchAndCacheOutletImages = async(
    endpoint: string = api.outletImages
  ): Promise<OutletImageItem[]> =>{
    try{
        console.log("[OUTLET IMAGE FETCH] Fetching Outlet Images....\n");

        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({}),
          });
      
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
      
          const data = await response.json();
      
          const images: OutletImageItem[] =
            Array.isArray(data?.media)
              ? data.media
              : [];
      
          console.log(`[FETCH] Received ${images.length} outlet images\n`);
      
          await AsyncStorage.setItem(
            OUTLET_IMAGE_CACHE_KEY,
            JSON.stringify({
              images,
              cachedAt: Date.now(),
            })
          );
          console.log(`[CACHE] Outlet images cached (${images.length})\n`);
          return images;
    }
    catch(err){
        console.error("[OUTLET IMAGE FETCH ERROR]", err);
        throw err;
    }
  }

  export const getCachedOutletImages = async (): Promise<OutletImageItem[]> => {
    try {
      const cached = await AsyncStorage.getItem(OUTLET_IMAGE_CACHE_KEY);

      if (!cached) {
        console.warn("[CACHE] No outlet image cache found\n");
        return [];
      }

      const parsed: OutletImageCache = JSON.parse(cached);
      
      console.log(`[CACHE] Loaded ${parsed.images.length} outlet images\n`);

      return parsed.images;

    } 
    
    catch (err) {
      console.error("[CACHE READ ERROR]", err);

      return [];
    }
};