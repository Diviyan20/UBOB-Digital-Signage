import { useNetworkStatus } from "@/context/NetworkStatusContext";
import React, { useEffect, useRef, useState } from "react";

import { config } from "../api/client";

import { getSignageVersion } from "@/services/MediaService";
import { watchDogOverlayStyle as styles } from "@/styling/OverlayStyles";
import { Text, View } from "react-native";
import { ImageComponent } from "./ImageComponent";
import { VideoComponent } from "./VideoComponent";

type MediaState = "IMAGES" | "VIDEOS";

const WATCHDOG_TIMEOUT_MS = 12000;
const MAX_RETRIES = 3;
const ERROR_DISPLAY_DURATION = 8000;

export const MediaController = () => {
  const [mediaState, setMediaState] = useState<MediaState>("IMAGES");
  const [hasSignageVideos, setHasSignageVideos] = useState(true);
  const { isOnline } = useNetworkStatus();
  const lastStatusRef = useRef<boolean | null>(null);
  const transitionTimerRef = useRef<number | null>(null);

  const [stateInterval, setStateInterval] = useState(60000);
  const [retryCount, setRetryCount] = useState(0);
  const [showError, setShowError] = useState(false);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearWatchdog = () => {
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  };

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await fetch(config);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        setStateInterval(data.config.state_interval);
      } catch (error) {
        console.error("CONFIG ERROR: ", error);
        // Fallback value already in state — controller keeps running
      }
    };
    fetchConfig();
  }, []);

  /*
   * Offline no longer locks to IMAGES.
   * VideoComponent now plays from local file storage — no internet needed.
   * The transition timer still runs so cached videos play on schedule.
   * If there are no cached videos, VideoComponent returns empty and
   * onAllVideosFinished fires immediately, reverting to IMAGES naturally.
   */

  const checkSignageVideos = async () => {
    try {
      console.log("[SIGNAGE CHECK] Checking folder status...");

      // Online: check live item count from server
      if (isOnline) {
        const version = await getSignageVersion();
        const hasVideos = version.itemCount > 0;

        if (lastStatusRef.current !== hasVideos) {
          console.log(
            `[SIGNAGE STATUS CHANGED] ${hasVideos ? "VIDEOS FOUND" : "NO VIDEOS"}`,
          );
          lastStatusRef.current = hasVideos;
        }

        console.log(`TOTAL VIDEOS: ${version.itemCount}`);
        setHasSignageVideos(hasVideos);
        return;
      }

      // Offline: check if we have locally cached videos
      const AsyncStorage = (
        await import("@react-native-async-storage/async-storage")
      ).default;
      const metaRaw = await AsyncStorage.getItem("signage_videos_meta");

      if (metaRaw) {
        const meta = JSON.parse(metaRaw);
        const hasCachedVideos = meta.items && meta.items.length > 0;
        console.log(
          `[SIGNAGE CHECK] Offline — ${hasCachedVideos ? meta.items.length + " cached videos" : "no cache"}`,
        );
        setHasSignageVideos(hasCachedVideos);
      } else {
        console.log("[SIGNAGE CHECK] Offline — no cache found");
        setHasSignageVideos(false);
      }
    } catch (err) {
      console.error("[SIGNAGE CHECK] Failed:", err);
      // Don't set hasSignageVideos to false on error —
      // keep last known state so cached videos still play
    }
  };

  useEffect(() => {
    checkSignageVideos();
    const interval = setInterval(checkSignageVideos, 120000);
    return () => clearInterval(interval);
  }, [isOnline]);

  // Transition timer — IMAGES → VIDEOS
  useEffect(() => {
    const transitionAt = new Date(Date.now() + stateInterval);
    console.log(
      `[MEDIA TIMER]
      Current Time : ${new Date().toLocaleTimeString()}
      Transition At: ${transitionAt.toLocaleTimeString()}
      Remaining    : ${stateInterval / 1000}s`,
    );

    if (mediaState !== "IMAGES") {
      console.log("[MEDIA CHECK] Blocked - not in IMAGES state");
      return;
    }

    if (showError) {
      console.log("[MEDIA CHECK] Blocked - error overlay active");
      return;
    }

    if (!hasSignageVideos) {
      console.log(
        "[MEDIA CHECK] Blocked - no videos available (online or cached)",
      );
      return;
    }

    const switchAt = new Date(Date.now() + stateInterval);
    console.log(
      `[MEDIA TIMER] IMAGES -> VIDEOS scheduled at ${switchAt.toLocaleTimeString()}`,
    );

    transitionTimerRef.current = setTimeout(() => {
      console.log(
        `[MEDIA TIMER] Switching to VIDEOS at ${new Date().toLocaleTimeString()}`,
      );
      transitionTimerRef.current = null;
      setMediaState("VIDEOS");
    }, stateInterval);

    return () => {
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
        transitionTimerRef.current = null;
      }
    };
  }, [mediaState, showError, hasSignageVideos, stateInterval]);

  useEffect(() => {
    console.log(
      `[SIGNAGE STATUS] hasSignageVideos changed -> ${hasSignageVideos}`,
    );
  }, [hasSignageVideos]);

  useEffect(() => {
    if (!showError) return;
    const timer = setTimeout(() => {
      console.log("[WATCHDOG] Error dismissed - resuming image display");
      setShowError(false);
      setRetryCount(0);
    }, ERROR_DISPLAY_DURATION);
    return () => clearTimeout(timer);
  }, [showError]);

  useEffect(() => {
    console.log(
      `[STATE CHANGE]
     Time : ${new Date().toLocaleTimeString()}
     State: ${mediaState}`,
    );
  }, [mediaState]);

  // Watchdog
  useEffect(() => {
    if (mediaState !== "VIDEOS") return;

    console.log(
      `[WATCHDOG] Started — waiting ${WATCHDOG_TIMEOUT_MS / 1000}s for playback`,
    );

    watchdogRef.current = setTimeout(() => {
      const nextRetry = retryCount + 1;
      console.warn(
        `[WATCHDOG] No playback detected. Retry ${nextRetry}/${MAX_RETRIES}`,
      );

      if (nextRetry >= MAX_RETRIES) {
        console.error("[WATCHDOG] Max retries reached — showing error");
        setShowError(true);
      } else {
        setRetryCount(nextRetry);
      }
      setMediaState("IMAGES");
    }, WATCHDOG_TIMEOUT_MS);

    return () => clearWatchdog();
  }, [mediaState]);

  const handlePlaybackStarted = () => {
    console.log("[WATCHDOG] Playback confirmed — watchdog cancelled");
    clearWatchdog();
    setRetryCount(0);
  };

  const handleVideosFinished = () => {
    console.log(
      `[MEDIA TIMER]
      Videos finished at ${new Date().toLocaleTimeString()}
      Switching back to IMAGES`,
    );
    clearWatchdog();
    requestAnimationFrame(() => {
      setMediaState("IMAGES");
    });
  };

  return (
    <>
      {mediaState === "IMAGES" && <ImageComponent />}

      {mediaState === "VIDEOS" && (
        <VideoComponent
          onAllVideosFinished={handleVideosFinished}
          onPlaybackStarted={handlePlaybackStarted}
        />
      )}

      {showError && (
        <View style={styles.errorOverlay}>
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Video Playback Unavailable</Text>
            <Text style={styles.errorMessage}>
              Videos could not be loaded after several attempts.{"\n"}
              Please restart the app in a few minutes.
            </Text>
            <Text style={styles.errorSub}>
              Promotion images will continue to display.
            </Text>
          </View>
        </View>
      )}
    </>
  );
};
