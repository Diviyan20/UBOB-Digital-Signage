import React, { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import ImageComponent from "./ImageComponent";
import VideoComponent, { VideoItem } from "./VideoComponent";

type MediaState = "IMAGES_PLAYING" | "VIDEOS_PLAYING";

const IMAGE_INTERVAL = 3 * 60 * 1000;

const sanitizePresignedUrl = (url: string) =>
  (url || "").trim().replace(/\\+$/g, "").replace(/\s+$/g, "");

const normalizeVideos = (items: VideoItem[]): VideoItem[] =>
  items
    .map((v) => ({
      ...v,
      videoURI: sanitizePresignedUrl(v.videoURI),
    }))
    .filter((v) => v.videoURI.startsWith("https://"));

const MediaController: React.FC = () => {
  const [mediaState, setMediaState] = useState<MediaState>("IMAGES_PLAYING");
  const [allVideos, setAllVideos] = useState<VideoItem[]>([]);
  const [currentBatch, setCurrentBatch] = useState<VideoItem[]>([]);

  const indexRef = useRef(0);
  const videoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const allVideosRef = useRef<VideoItem[]>([]);

  const fetchVideos = async () => {
    try {
      const res = await fetch(api.videos);
      const payload = await res.json();

      console.log("VIDEO PAYLOAD:", payload);

      if (!res.ok) {
        throw new Error(payload?.error || "Failed to fetch videos");
      }

      // Handles:
      // 1) direct array: [{ videoURI, rotate }]
      // 2) wrapped: { videos: [...] }
      // 3) Lambda proxy style wrapper: { body: "[...]" }
      let videos: VideoItem[] = [];

      if (Array.isArray(payload)) {
        videos = payload;
      } else if (Array.isArray(payload?.videos)) {
        videos = payload.videos;
      } else if (typeof payload?.body === "string") {
        const parsedBody = JSON.parse(payload.body);
        videos = Array.isArray(parsedBody)
          ? parsedBody
          : Array.isArray(parsedBody?.videos)
            ? parsedBody.videos
            : [];
      }

      const normalizedVideos = normalizeVideos(videos);

      if (!normalizedVideos.length) {
        console.error("No valid videos returned");
        return;
      }

      const shuffled = [...normalizedVideos].sort(() => Math.random() - 0.5);

      allVideosRef.current = shuffled;
      setAllVideos(shuffled);
      setCurrentBatch(shuffled);
      indexRef.current = 0;
    } catch (err) {
      console.error("Failed to fetch videos:", err);
    }
  };

  useEffect(() => {
    fetchVideos();
  }, []);

  const getNextBatch = (): VideoItem[] => {
    const batchSize = 2;
    const videos = allVideosRef.current;

    if (!videos.length) return [];

    const batch = videos.slice(indexRef.current, indexRef.current + batchSize);
    indexRef.current += batchSize;

    if (indexRef.current >= videos.length) {
      indexRef.current = 0;
      allVideosRef.current = [...videos].sort(() => Math.random() - 0.5);
      setAllVideos((prev) => [...prev].sort(() => Math.random() - 0.5));
    }

    return batch;
  };

  useEffect(() => {
    if (mediaState !== "IMAGES_PLAYING") return;

    videoTimerRef.current = setTimeout(() => {
      const batch = getNextBatch();
      setCurrentBatch(batch);
      console.log("Playing batch:", batch.length);
      setMediaState("VIDEOS_PLAYING");
    }, IMAGE_INTERVAL);

    return () => {
      if (videoTimerRef.current) clearTimeout(videoTimerRef.current);
    };
  }, [mediaState, allVideos]);

  const handleVideosFinished = useCallback(async () => {
    await fetchVideos(); // refresh signed URLs
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
};

export default MediaController;
