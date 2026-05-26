import { api } from "@/components/api/client";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface VideoItem{
    videoURI: string;
    rotate?: boolean;
}

export interface PlaylistItems{
    type: "video" | "image";
    url: string;
    rotate?: boolean;
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
            console.warn("fetchPlaylist: No outlet_id in AsyncStorage");
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

/**
 * Fetches videos only — used by the Signage Screen
 */
export const fetchSignageVideos = async (): Promise<VideoItem[]> => {
    try{
        const response = await fetch(api.signageVideos, {
            method: "GET",
            headers:{ "Content-Type": "application/json" }
        });

        const data = await response.json();

        if(!response.ok){
            throw new Error(data?.message || "Failed to fetch videos");
        }

        const videos = data?.videos || []; // Backend returns: videos: [....]

        /*
        * Clean invalid URLs
        */
        const cleanedVideos = videos
        .map((video: VideoItem) => ({
            ...video,
            videoURI: sanitizeVideoUrl(video.videoURI)
        }))
        .filter((video: VideoItem) => video.videoURI.startsWith("https://"));

    console.log("VIDEOS:", cleanedVideos);
    return cleanedVideos;
    }
    catch(error){
        console.error("FETCH VIDEO ERROR: ", error);
        return [];
    }
}