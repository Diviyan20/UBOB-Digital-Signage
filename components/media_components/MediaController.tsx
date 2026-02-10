import React, { useCallback, useEffect, useRef, useState } from "react";
import ImageComponent from "./ImageComponent";
import VideoComponent from "./VideoComponent";

type MediaState = "IMAGES_PLAYING" | "VIDEOS_PLAYING";

const VIDEO_INTERVAL = 3 * 60 * 1000; // 3 minutes

const MediaController: React.FC = () => {
    const [mediaState, setMediaState] = useState<MediaState>("IMAGES_PLAYING");
    const videoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isMounted = useRef(true);

    // Switch to videos every 3 minutes
    useEffect(() =>{
        isMounted.current = true;

        if (mediaState === "IMAGES_PLAYING"){
            videoTimerRef.current = setTimeout(() =>{
                if (isMounted.current){
                    console.log("🎬 Switching to videos....")
                    setMediaState("VIDEOS_PLAYING")
                }
            }, VIDEO_INTERVAL);
        }

        return () =>{
            if (videoTimerRef.current){
                clearTimeout(videoTimerRef.current);
            }
        };
    }, [mediaState]);

    useEffect(() => {
        return () => {
          isMounted.current = false;
        };
      }, []);
    
      const handleAllVideosFinished = useCallback(() => {
        console.log("✅ All videos finished, returning to images");
        setMediaState("IMAGES_PLAYING");
      }, []);
    
      return (
        <>
          {mediaState === "IMAGES_PLAYING" && <ImageComponent />}
          {mediaState === "VIDEOS_PLAYING" && (
            <VideoComponent 
            onAllVideosFinished={handleAllVideosFinished} />
          )}
        </>
      );
}

export default MediaController;
