import React, { useCallback, useEffect, useRef, useState } from "react";
import ImageComponent from "./ImageComponent";
import VideoComponent from "./VideoComponent";
import { promotionVideos } from "./Videos";

type MediaState = "IMAGES_PLAYING" | "VIDEOS_PLAYING";

const IMAGE_INTERVAL = 60 * 1000;

const MediaController: React.FC = () => {
    const [mediaState, setMediaState] = useState<MediaState>("IMAGES_PLAYING");
    const [currentBatch, setCurrentBatch] = useState<typeof promotionVideos>([]);
    const isMounted = useRef(true);
    const indexRef = useRef(0);
    const videoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    
    // Get next batch of videos
    const getNextBatch = () =>{
      const batchSize = 2;

      const batch = promotionVideos.slice(
        indexRef.current,
        indexRef.current + batchSize
      );

      indexRef.current += batchSize;
    
      // reset if needed
      if (indexRef.current >= promotionVideos.length){
        promotionVideos.sort(() => Math.random() - 0.5); // quick shuffle
        indexRef.current = 0;
      }

      return batch;
    };

    // Switch from images → videos
  useEffect(() => {
    if (mediaState !== "IMAGES_PLAYING") return;

    videoTimerRef.current = setTimeout(() => {
      const batch = getNextBatch();
      setCurrentBatch(batch);

      console.log("🎬 Playing batch:", batch.length);

      setMediaState("VIDEOS_PLAYING");
    }, IMAGE_INTERVAL);

    return () => {
      if (videoTimerRef.current) clearTimeout(videoTimerRef.current);
    };
  }, [mediaState]);

  // When videos finish → back to images
  const handleVideosFinished = useCallback(() => {
    setMediaState("IMAGES_PLAYING");
  }, []);

  return (
    <>
      {mediaState === "IMAGES_PLAYING" && <ImageComponent />}

      {mediaState === "VIDEOS_PLAYING" && (
        <VideoComponent
          videos={currentBatch}
          onAllVideosFinished={handleVideosFinished}
        />
      )}
    </>
  );
}

export default MediaController;
