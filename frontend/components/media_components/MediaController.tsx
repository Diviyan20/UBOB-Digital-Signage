import React, { useCallback, useEffect, useRef, useState } from "react";

import { api } from "../api/client";

import { loadPreparedSignageVideos } from "@/frontend/services/MediaService";

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

  const [hasSignageVideos, setHasSignageVideos] = useState(false);

  const [stateInterval, setStateInterval] = useState(60000);

  const [retryCount, setRetryCount] = useState(0);

  const [showError, setShowError] = useState(false);

  /*
   * This is the important part:
   *
   * 0 → first video
   * 1 → second video
   * 2 → third video
   * ...
   *
   * It survives the VideoComponent unmount/remount.
   */
  const nextVideoIndexRef = useRef(0);

  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---------------------------------------------------------------------------
  // Watchdog cleanup
  // ---------------------------------------------------------------------------

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Load configuration
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await fetch(api.config);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        const interval = data.config?.state_interval;

        if (typeof interval === "number" && interval > 0) {
          setStateInterval(interval);

          console.log(`[CONFIG] state_interval = ${interval}ms`);
        }
      } catch (error) {
        console.error("[CONFIG] Failed to load config:", error);
      }
    };

    void fetchConfig();
  }, []);

  // ---------------------------------------------------------------------------
  // Check locally prepared signage videos
  // ---------------------------------------------------------------------------

  const checkSignageVideos = useCallback(async () => {
    try {
      const preparedVideos = await loadPreparedSignageVideos();

      console.log(
        `[SIGNAGE CHECK] Local prepared videos: ${preparedVideos.length}`,
      );

      setHasSignageVideos(preparedVideos.length > 0);

      /*
       * If the number of available videos
       * changed and our next index is now
       * outside the array, wrap it back.
       */
      if (
        preparedVideos.length > 0 &&
        nextVideoIndexRef.current >= preparedVideos.length
      ) {
        nextVideoIndexRef.current = 0;
      }

      /*
       * If all signage media disappear,
       * don't leave the rotation index
       * pointing at something invalid.
       */
      if (preparedVideos.length === 0) {
        nextVideoIndexRef.current = 0;
      }
    } catch (error) {
      console.error("[SIGNAGE CHECK] Failed:", error);
    }
  }, []);

  useEffect(() => {
    void checkSignageVideos();

    const interval = setInterval(() => {
      void checkSignageVideos();
    }, 120000);

    return () => clearInterval(interval);
  }, [checkSignageVideos]);

  // ---------------------------------------------------------------------------
  // IMAGES → VIDEOS
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (mediaState !== "IMAGES") {
      return;
    }

    if (showError) {
      return;
    }

    if (!hasSignageVideos) {
      console.log("[MEDIA CHECK] Blocked - no local signage videos");

      return;
    }

    console.log(
      `[MEDIA TIMER] Images → Videos in ${stateInterval / 1000} seconds`,
    );

    transitionTimerRef.current = setTimeout(() => {
      console.log(
        `[MEDIA TIMER] Switching to VIDEOS — video index ${nextVideoIndexRef.current}`,
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

  // ---------------------------------------------------------------------------
  // Error overlay timeout
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!showError) {
      return;
    }

    const timer = setTimeout(() => {
      console.log("[WATCHDOG] Error dismissed - resuming images");

      setShowError(false);
      setRetryCount(0);
    }, ERROR_DISPLAY_DURATION);

    return () => {
      clearTimeout(timer);
    };
  }, [showError]);

  // ---------------------------------------------------------------------------
  // Watchdog
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (mediaState !== "VIDEOS") {
      return;
    }

    clearWatchdog();

    console.log(
      `[WATCHDOG] Waiting ${
        WATCHDOG_TIMEOUT_MS / 1000
      } seconds for video playback`,
    );

    watchdogRef.current = setTimeout(() => {
      const nextRetry = retryCount + 1;

      console.warn(`[WATCHDOG] Playback failed — ${nextRetry}/${MAX_RETRIES}`);

      if (nextRetry >= MAX_RETRIES) {
        setShowError(true);
      } else {
        setRetryCount(nextRetry);
      }

      setMediaState("IMAGES");
    }, WATCHDOG_TIMEOUT_MS);

    return () => {
      clearWatchdog();
    };
  }, [mediaState, retryCount, clearWatchdog]);

  // ---------------------------------------------------------------------------
  // Playback confirmed
  // ---------------------------------------------------------------------------

  const handlePlaybackStarted = useCallback(() => {
    console.log("[WATCHDOG] Playback confirmed");

    clearWatchdog();

    setRetryCount(0);
  }, [clearWatchdog]);

  // ---------------------------------------------------------------------------
  // ONE video finished
  // ---------------------------------------------------------------------------

  const handleVideoFinished = useCallback(() => {
    console.log(
      `[MEDIA TIMER] Video ${nextVideoIndexRef.current + 1} finished`,
    );

    clearWatchdog();

    /*
     * Advance the index BEFORE going back
     * to IMAGES.
     *
     * Example:
     *
     * 0 finishes → next = 1
     * 1 finishes → next = 2
     * 2 finishes → next = 3
     *
     * Once we reach the end, wrap back
     * around to video 0.
     */
    nextVideoIndexRef.current += 1;

    if (hasSignageVideos) {
      /*
       * We don't know the exact count here,
       * so load it from disk before wrapping.
       */
      void (async () => {
        try {
          const videos = await loadPreparedSignageVideos();

          if (videos.length === 0) {
            nextVideoIndexRef.current = 0;
          } else {
            nextVideoIndexRef.current =
              nextVideoIndexRef.current % videos.length;
          }
        } catch {
          nextVideoIndexRef.current = 0;
        }

        setMediaState("IMAGES");
      })();

      return;
    }

    nextVideoIndexRef.current = 0;
    setMediaState("IMAGES");
  }, [clearWatchdog, hasSignageVideos]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      {mediaState === "IMAGES" && <ImageComponent />}

      {mediaState === "VIDEOS" && (
        <VideoComponent
          videoIndex={nextVideoIndexRef.current}
          onVideoFinished={handleVideoFinished}
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
