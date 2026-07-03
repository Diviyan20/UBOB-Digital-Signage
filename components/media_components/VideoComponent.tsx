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
  onPlaybackStarted: () => void; // signals watchdog to cancel
}
/*
  * Set to true to simulate video failure 

  * NOTE: ALWAYS SET TO 'FALSE' FOR PRODUCTION
*/
const DEV_BLOCK_PLAYBACK = false;

const VERSION_CHECK_INTERVAL_MS = 30 * 60 * 1000; // Check every 30 minutes

export const VideoComponent = ({
  onAllVideosFinished,
  onPlaybackStarted,
}: Props) => {
  const { width, height } = useWindowDimensions();
  const styles = VideoStyles(width, height);

  const [videos, setVideos] = useState<VideoItem[]>([]); // All fetched videos
  const [currentIndex, setCurrentIndex] = useState(0); // Current playing video index

  // Ref so effects always read the latest list without stale closures
  const videosRef = useRef<VideoItem[]>([]);
  const advancingRef = useRef(false);
  const isMounted = useRef(true);
  const hasSignaled = useRef(false); // Only signal once per mount

  const currentVideo = videos[currentIndex]; //Current video object

  /**
   * Video player
   */
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
   * Fetch videos on mount
   */
  useEffect(() => {
    const loadVideos = async () => {
      const fetchedVideos = await fetchSignageVideos();
      const randomIndex = Math.floor(Math.random() * fetchedVideos.length);
      console.log("Fetched before slice:", fetchedVideos.length);

      if (!isMounted.current) return;

      const selectedVideos = [fetchedVideos[randomIndex]];

      videosRef.current = selectedVideos;
      setVideos(selectedVideos);
    };

    loadVideos();
  }, []);

  /**
   * Load current video into player when videos load or index changes
   */
  useEffect(() => {
    if (videosRef.current.length === 0) return;

    const url = videosRef.current[currentIndex]?.videoURI;
    if (!url) return;

    const load = async () => {
      try {
        if (DEV_BLOCK_PLAYBACK) {
          // Simulates a hung video load — player stays idle
          // Watchdog should fire after WATCHDOG_TIMEOUT_MS
          console.warn("[DEV] Playback blocked — watchdog test active");
          return; // never calls replaceAsync, never signals onPlaybackStarted
        }
        console.log(
          `[VIDEO] Loading video ${currentIndex + 1}/${videosRef.current.length}`,
        );

        const start = Date.now();
        /*
         * Add a pre-video timeout (Suppose if entire component hangs)
         */
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Load timeout")), 8000),
        );

        await Promise.race([player.replaceAsync(url), timeoutPromise]);

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
  }, [currentIndex, videos]); // fires when videos first load, and on every index change

  /**
   * Move to next video
   */
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

  /**
   * Listen for video completion
   */
  useEffect(() => {
    if (!player) return;

    const subscription = player.addListener("playToEnd", playNextVideo);

    return () => {
      subscription.remove();
    };
  }, [player, playNextVideo]);

  /*
   * Listen for playback errors
   */
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

  /*
   * Cleanup for player
   */
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

  /*
   * Added emergency timeout in case watchdog fails
   * Recovers after 45 seconds
   */
  useEffect(() => {
    const emergencyTimer = setTimeout(() => {
      console.warn("[VIDEO] Component stuck. Returning to images.");

      onAllVideosFinished();
    }, 45000);

    return () => clearTimeout(emergencyTimer);
  }, []);

  useEffect(() => {
    const checkForUpdates = async () => {
      console.log("[VERSION CHECK] Checking signage videos for new content...");

      const serverEtag = await getSignageVersion();
      if (!serverEtag) {
        console.warn("[VERSION CHECK] Could not reach server — skipping");
        return;
      }

      try {
        const cachedRaw = await AsyncStorage.getItem("signage_videos_cache");
        if (!cachedRaw) return;

        const cache = JSON.parse(cachedRaw);

        if (cache.etag !== serverEtag) {
          console.log(
            `[VERSION CHECK] Signage videos changed: ${cache.etag} → ${serverEtag}`,
          );
          console.log(
            "[VERSION CHECK] Cache cleared — new videos load on next cycle",
          );
          await clearVideoCache();
          // Don't interrupt current playback.
          // Cache is cleared — when VideoComponent remounts after
          // onAllVideosFinished, it will automatically fetch fresh.
        } else {
          console.log(
            `[VERSION CHECK] Signage videos unchanged — etag: ${serverEtag}`,
          );
        }
      } catch (err) {
        console.warn("[VERSION CHECK] Error:", err);
      }
    };

    const interval = setInterval(checkForUpdates, VERSION_CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  /**
   * Loading state
   */
  if (!videos.length) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
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
