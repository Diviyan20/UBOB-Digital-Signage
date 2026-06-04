import { api } from "@/components/api/client";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface VideoItem{
    videoURI: string;
    rotate?: boolean;
    sizeMb?: number;
    optimized?: boolean;
}

export interface PlaylistItems{
    type: "video" | "image";
    url: string;
    rotate?: boolean;
}

// Cache config
const VIDEO_CACHE_KEY = "signage_videos_cache";
const CACHE_TTL_MS = 23 * 60 * 60 * 1000; // 23 hours

interface VideoCache {
    videos: VideoItem[];
    cachedAt: number;
    outletId: string; // invalidate if outlet changes
}

/**
 * Removes invalid trailing characters from presigned URLs
 */
export const sanitizeVideoUrl = (url?: string): string =>{
    return (url || "")
    .trim()
    .replace(/\\+$/g, "")
    .replace(/\s+$/g, "");
};

/**
 * Clears the signage video cache.
 * Call this when logging into a different outlet.
 */
export const clearVideoCache = async (): Promise<void> => {
    await AsyncStorage.removeItem(VIDEO_CACHE_KEY);
    console.log("[CACHE] Video cache cleared");
};

/**
 * Fetches signage videos.
 *
 * Cache flow:
 *   1. Check AsyncStorage for cached video list
 *   2. If valid cache exists → return it (no backend call)
 *   3. If cache is empty or expired → fetch from backend once
 *   4. Store result in AsyncStorage
 *   5. Frontend plays from CloudFront URLs — no further requests needed
 */
export const fetchSignageVideos = async (): Promise<VideoItem[]> => {
    const outletId = await AsyncStorage.getItem("outlet_id");

    if (!outletId) {
        console.warn("[CACHE] No outlet_id in AsyncStorage");
        return [];
    }

    // ── Step 1: Check cache ──────────────────────────────────────────────────
    try {
        const cachedRaw = await AsyncStorage.getItem(VIDEO_CACHE_KEY);

        if (cachedRaw) {
            const cache: VideoCache = JSON.parse(cachedRaw);
            const ageMs = Date.now() - cache.cachedAt;
            const ageHours = (ageMs / 3600000).toFixed(1);

            if (cache.outletId === outletId && ageMs < CACHE_TTL_MS) {
                // Cache is valid — return without hitting backend
                console.log(`[CACHE HIT] ${cache.videos.length} videos cached, age: ${ageHours}h`);
                console.log("[CACHE] Skipping backend request — playing from CloudFront");
                return cache.videos;
            }

            const totalSize = cache.videos.reduce(
                (sum, video) => sum + (video.sizeMb || 0),
                0
            );
            
            console.log("========== CACHE HIT ==========");
            console.log(`Videos: ${cache.videos.length}`);
            console.log(`Total Size: ${totalSize.toFixed(2)} MB`);
            console.log(`Age: ${ageHours}h`);
            console.log("Source: AsyncStorage");
        } else {
            console.log("[CACHE MISS] No cache found");
        }
    } catch {
        console.warn("[CACHE] Failed to read cache — fetching fresh");
    }

    // ── Step 2: Fetch from backend ───────────────────────────────────────────
    console.log("[FETCH] Requesting video list from backend...");

    try {
        const response = await fetch(api.signageVideos, {
            method: "GET",
            headers: { "Content-Type": "application/json" },
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data?.message || "Failed to fetch videos");
        }

        const videos: VideoItem[] = data?.videos || [];

        const cleanedVideos = videos
            .map((video) => ({
                ...video,
                videoURI: sanitizeVideoUrl(video.videoURI),
            }))
            .filter((video) => video.videoURI.startsWith("https://"));
        // ── Step 3: Store in cache ───────────────────────────────────────────
        const cachePayload: VideoCache = {
            videos: cleanedVideos,
            cachedAt: Date.now(),
            outletId,
        };

        await AsyncStorage.setItem(VIDEO_CACHE_KEY, JSON.stringify(cachePayload));
        console.log("[CACHE] Video list cached — future loads will skip backend");
        console.log("[CACHE] Videos will play directly from CloudFront");

        const totalSize = cleanedVideos.reduce(
            (sum, video) => sum + (video.sizeMb || 0),
            0
        );
        
        console.log("========== BACKEND FETCH ==========");
        console.log(`Videos: ${cleanedVideos.length}`);
        console.log(`Total Size: ${totalSize.toFixed(2)} MB`);
        console.log("Source: Backend");

        return cleanedVideos;

    } catch (error) {
        console.error("[FETCH ERROR]", error);
        return [];
    }
};

/*
 * Fetches the playlist (images + videos) from the backend.
 * Reads outlet_id, batch_number, and orientation from AsyncStorage.
*/
export const fetchPlaylist = async(): Promise<PlaylistItems[]> =>{
    try{
        const outletId = await AsyncStorage.getItem("outlet_id");
        const batchNumber = await AsyncStorage.getItem("batch_number");
        const orientation = await AsyncStorage.getItem("orientation") || "Landscape";

        if (!outletId) {
            console.warn("[fetchPlaylist] No outlet_id in AsyncStorage");
            return [];
        }

        const response = await fetch(api.playlist, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                outlet_id: outletId,
                batch_number: parseInt(batchNumber || "1"),
                orientation: orientation,
            }),
        });
        const data = await response.json();

        if(!response.ok){
            throw new Error(data?.message || "Failed to fetch playlist");
        }

        const playlist: PlaylistItems[] = data.playlist || [];
        console.log(`Playlist fetched: ${playlist.length} items`);
        return playlist;
    }
    catch(err){
        console.error("fetchPlaylist error:", err);
        return [];
    }
};