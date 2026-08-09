import {
  clearVideoCache,
  fetchSignageVideos,
  getSignageVersion,
  VideoItem,
} from "@/services/MediaService";
import { VideoStyles } from "@/styling/MediaStyles";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useEffect, useRef, useState } from "react";
import { Text, useWindowDimensions, View } from "react-native";

interface Props {
  onAllVideosFinished: () => void;
  onPlaybackStarted: () => void;
}

const DEV_BLOCK_PLAYBACK = false;
// NOTE: ALWAYS SET TO 'FALSE' FOR PRODUCTION

const VERSION_CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

export const VideoComponent = ({
  onAllVideosFinished,
  onPlaybackStarted,
}: Props) => {
  const { width, height } = useWindowDimensions();
  const styles = VideoStyles(width, height);

  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const videosRef = useRef<VideoItem[]>([]);
  const isMounted = useRef(true);
  const hasSignaled = useRef(false);
  const isLoading = useRef(true);

  const currentVideo = videos[currentIndex];

  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
  });

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  /**
   * Fetch videos on mount — videoURI is now a local file:// path
   */
  useEffect(() => {
    const loadVideos = async () => {
      const fetchedVideos = await fetchSignageVideos();
      console.log("Fetched signage videos:", fetchedVideos.length);
      isLoading.current = false;

      if (!isMounted.current) return;
      if (fetchedVideos.length === 0) return;

      // Pick a random video to start the cycle
      const randomIndex = Math.floor(Math.random() * fetchedVideos.length);
      const selectedVideos = [fetchedVideos[randomIndex]];

      videosRef.current = selectedVideos;
      setVideos(selectedVideos);
    };

    loadVideos();
  }, []);

  /**
   * Load current video — videoURI points to local storage
   */
  useEffect(() => {
    if (videosRef.current.length === 0) return;

    const uri = videosRef.current[currentIndex]?.videoURI;
    if (!uri) return;

    const load = async () => {
      try {
        if (DEV_BLOCK_PLAYBACK) {
          console.warn("[DEV] Playback blocked — watchdog test active");
          return;
        }

        console.log(
          `[VIDEO] Loading video ${currentIndex + 1}/${videosRef.current.length}`,
        );
        console.log(`[VIDEO] URI: ${uri}`);

        const start = Date.now();
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Load timeout")), 8000),
        );

        await Promise.race([player.replaceAsync(uri), timeoutPromise]);
        console.log(
          `[VIDEO] replaceAsync finished in ${Date.now() - start} ms`,
        );

        player.play();
        console.log("[VIDEO] play() called");
      } catch (err) {
        console.error("Failed to load video:", err);
        playNextVideo();
      }
    };

    load();
  }, [currentIndex, videos]);

  const playNextVideo = () => {
    if (!isMounted.current) return;

    setCurrentIndex((prev) => {
      const next = prev + 1;
      if (next >= videosRef.current.length) {
        console.log("[VIDEO] Playlist finished");
        onAllVideosFinished();
        return prev;
      }
      console.log(`[VIDEO] Moving to video ${next}`);
      return next;
    });
  };

  useEffect(() => {
    if (!player) return;
    const subscription = player.addListener("playToEnd", playNextVideo);
    return () => subscription.remove();
  }, [player, playNextVideo]);

  useEffect(() => {
    const subscription = player.addListener("statusChange", (status) => {
      console.log("[VIDEO STATUS]", status.status);
      if (status.status === "readyToPlay" && !hasSignaled.current) {
        hasSignaled.current = true;
        onPlaybackStarted();
      }
    });
    return () => subscription.remove();
  }, [player]);

  useEffect(() => {
    return () => {
      console.log("[VIDEO] Releasing player");
      try {
        player.release();
      } catch (e) {
        console.warn("Player cleanup failed:", e);
      }
    };
  }, [player]);

  useEffect(() => {
    const emergencyTimer = setTimeout(() => {
      console.warn("[VIDEO] Component stuck. Returning to images.");
      onAllVideosFinished();
    }, 45000);
    return () => clearTimeout(emergencyTimer);
  }, []);

  /**
   * Periodic version check — clears cache if content changed.
   * VideoComponent remounts after onAllVideosFinished and fetches fresh.
   */
  useEffect(() => {
    const checkForUpdates = async () => {
      console.log("[VERSION CHECK] Checking signage videos for new content...");

      try {
        const { etag: serverEtag } = await getSignageVersion();

        if (!serverEtag) {
          console.warn("[VERSION CHECK] Could not reach server — skipping");
          return;
        }

        const metaRaw = await AsyncStorage.getItem("signage_videos_meta");
        if (!metaRaw) return;

        const meta = JSON.parse(metaRaw);

        if (meta.etag !== serverEtag) {
          console.log(`[VERSION CHECK] Changed: ${meta.etag} → ${serverEtag}`);
          console.log(
            "[VERSION CHECK] Cache cleared — new videos load on next cycle",
          );
          await clearVideoCache();
          // Don't interrupt current playback —
          // cache cleared, VideoComponent fetches fresh on next remount
        } else {
          console.log(`[VERSION CHECK] Unchanged — etag: ${serverEtag}`);
        }
      } catch (err) {
        console.warn("[VERSION CHECK] Error:", err);
      }
    };

    const interval = setInterval(checkForUpdates, VERSION_CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  if (!videos.length) {
    // Still loading from cache - show nothing rather than flashing "No videos"
    if (isLoading.current) return null;

    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text>No videos available</Text>
      </View>
    );
  }

  if (currentVideo?.rotate) {
    return (
      <View style={styles.portraitCard}>
        <View style={styles.videoContainer}>
          <VideoView
            player={player}
            style={styles.portraitVideo}
            contentFit="contain"
            nativeControls={false}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.landscapeCard}>
      <View style={styles.videoContainer}>
        <VideoView
          player={player}
          style={styles.video}
          contentFit="contain"
          nativeControls={false}
        />
      </View>
    </View>
  );
};
