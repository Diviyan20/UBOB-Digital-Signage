import { api } from "@/components/api/client";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface VideoItem{
    videoURI: string;
    rotate?: boolean;
}

/**
 * Removes invalid trailing characters
 * from presigned URLs
 */
export const sanitizeVideoUrl = (url?: string): string =>{
    return (url || "")
    .trim()
    .replace(/\\+$/g, "")
    .replace(/\s+$/g, "");
};

/**
 * Fetch videos from backend
 */
export const fetchVideos = async (): Promise<VideoItem[]> => {
    try{
        const outlet_id = await AsyncStorage.getItem("outlet_id");

        if (!outlet_id) {
            console.warn("No outlet_id found in AsyncStorage");
            return [];
        }

        const response = await fetch(api.videos, {
            method: "POST",
            headers:{
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ outlet_id })
        });

        const data = await response.json();

        if(!response.ok){
            throw new Error(data?.message || "Failed to fetch videos");
        }

        /*
         * Backend returns:
         * {
         *   videos: [...]
         * }
        */
        const videos = data?.videos || [];

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