import React, { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import ImageComponent from "./ImageComponent";
import VideoComponent, { VideoItem } from "./VideoComponent";
import { storage } from "./storage";

type MediaState = "IMAGES_PLAYING" | "VIDEOS_PLAYING";

const IMAGE_INTERVAL = 3 * 60 * 1000;

const MediaController: React.FC = () => {
  const [mediaState, setMediaState] = useState<MediaState>("IMAGES_PLAYING");
  const [allVideos, setAllVideos] = useState<VideoItem[]>([]);
  const [currentBatch, setCurrentBatch] = useState<VideoItem[]>([]);

  const indexRef = useRef(0);
  const videoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // =========================
  // FETCH VIDEOS (SIGNED URLS)
  // =========================
  const fetchVideos = async () => {
    const outletId = storage.getString("outlet_id");
    if (!outletId) return;

    try {
      const res = await fetch(api.videos(outletId));
      const payload = await res.json();

      if (!res.ok) {
        throw new Error(payload?.error || "Failed to fetch videos");
      }

      // Backend returns either:
      // 1) [{ videoURI, rotate }] OR 2) { videos: [] }
      const videos: VideoItem[] = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.videos)
          ? payload.videos
          : [];

      const shuffled = [...videos].sort(() => Math.random() - 0.5);

      setAllVideos(shuffled);
      indexRef.current = 0;
    } catch (err) {
      console.error("Failed to fetch videos:", err);
    }
  };

  useEffect(() => {
    fetchVideos();
  }, []);

  // =========================
  // GET NEXT BATCH
  // =========================
  const getNextBatch = (): VideoItem[] => {
    const batchSize = 2;

    if (!allVideos.length) return [];

    const batch = allVideos.slice(
      indexRef.current,
      indexRef.current + batchSize,
    );

    indexRef.current += batchSize;

    if (indexRef.current >= allVideos.length) {
      indexRef.current = 0;
      setAllVideos((prev) => [...prev].sort(() => Math.random() - 0.5));
    }

    return batch;
  };

  // =========================
  // SWITCH TO VIDEOS
  // =========================
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
  }, [mediaState, allVideos]);

  // =========================
  // BACK TO IMAGES + REFRESH
  // =========================
  const handleVideosFinished = useCallback(async () => {
    await fetchVideos(); // refresh signed URLs
    setMediaState("IMAGES_PLAYING");
  }, []);

  // =========================
  // RENDER
  // =========================
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
};

export default MediaController;
