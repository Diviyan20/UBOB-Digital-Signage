import React, { useCallback, useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";

import {
  fetchSignageMedia,
  getCachedSignageMedia,
} from "@/frontend/services/media/SignageService";
import { watchDogOverlayStyle as styles } from "@/styling/OverlayStyles";
import { api } from "../api/client";
import { ImageComponent } from "./ImageComponent";
import { VideoComponent } from "./VideoComponent";

type MediaState = "IMAGES" | "VIDEOS";

const WATCHDOG_TIMEOUT_MS = 12000;
const MAX_RETRIES = 3;
const ERROR_DISPLAY_DURATION = 8000;
const DEFAULT_REFRESH_INTERVAL_MS = 1800000; // 30 min fallback

export const MediaController = () => {
  const [mediaState, setMediaState] = useState<MediaState>("IMAGES");
  const [stateInterval, setStateInterval] = useState(60000);
  const [refreshInterval, setRefreshInterval] = useState(
    DEFAULT_REFRESH_INTERVAL_MS,
  );
  const [hasSignageMedia, setHasSignageMedia] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [showError, setShowError] = useState(false);
  const [videoIndex, setVideoIndex] = useState(0);

  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMounted = useRef(true);

  // ── Config ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const res = await fetch(api.config);
        const data = await res.json();
        setStateInterval(data.config.state_interval ?? 60000);
        // Pull refresh interval from DB — falls back to 30 min if not set
        setRefreshInterval(
          data.config.signage_refresh_interval ?? DEFAULT_REFRESH_INTERVAL_MS,
        );
      } catch (err) {
        console.error("[CONFIG ERROR]", err);
      }
    };
    void loadConfig();
  }, []);

  // ── Signage media fetch ─────────────────────────────────────────────────────

  /**
   * Fetches latest signage media from Odoo via backend.
   * Downloads new files, deletes stale ones.
   * Sets hasSignageMedia so the transition timer knows whether to switch.
   */
  const refreshSignageMedia = useCallback(async () => {
    console.log("[SIGNAGE] Refreshing from Odoo...");
    try {
      const items = await fetchSignageMedia();
      if (!isMounted.current) return;
      setHasSignageMedia(items.length > 0);
      console.log(`[SIGNAGE] ${items.length} item(s) ready`);
    } catch (err) {
      console.error("[SIGNAGE] Refresh failed:", err);
      // Don't flip hasSignageMedia — keep showing whatever was last known
    }
  }, []);

  // On mount: serve cached media immediately, then kick off first refresh
  useEffect(() => {
    isMounted.current = true;

    const init = async () => {
      // Show cached items right away so there's no blank period on boot
      const cached = await getCachedSignageMedia();
      if (isMounted.current) setHasSignageMedia(cached.length > 0);

      // Then fetch fresh from Odoo in the background
      await refreshSignageMedia();
    };

    void init();
    return () => {
      isMounted.current = false;
    };
  }, [refreshSignageMedia]);

  // Periodic re-fetch — interval comes from DB config
  useEffect(() => {
    if (refreshInterval <= 0) return;

    const timer = setInterval(() => {
      console.log(
        `[SIGNAGE] Periodic refresh (every ${refreshInterval / 60000} min)`,
      );
      void refreshSignageMedia();
    }, refreshInterval);

    return () => clearInterval(timer);
  }, [refreshInterval, refreshSignageMedia]);

  // ── IMAGES → VIDEOS transition timer ───────────────────────────────────────

  useEffect(() => {
    if (mediaState !== "IMAGES") {
      console.log("[MEDIA CHECK] Blocked — not in IMAGES state");
      return;
    }
    if (showError) {
      console.log("[MEDIA CHECK] Blocked — error overlay active");
      return;
    }
    if (!hasSignageMedia) {
      console.log("[MEDIA CHECK] Blocked — no signage media available");
      return;
    }

    console.log(`[MEDIA TIMER] IMAGES → VIDEOS in ${stateInterval / 1000}s`);

    transitionTimerRef.current = setTimeout(() => {
      console.log("[MEDIA TIMER] Switching to VIDEOS");
      setMediaState("VIDEOS");
    }, stateInterval);

    return () => {
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    };
  }, [mediaState, showError, hasSignageMedia, stateInterval]);

  // ── Watchdog ────────────────────────────────────────────────────────────────

  const clearWatchdog = () => {
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  };

  useEffect(() => {
    if (mediaState !== "VIDEOS") return;

    console.log(
      `[WATCHDOG] Waiting ${WATCHDOG_TIMEOUT_MS / 1000}s for playback...`,
    );

    watchdogRef.current = setTimeout(() => {
      const next = retryCount + 1;
      console.warn(`[WATCHDOG] No playback — retry ${next}/${MAX_RETRIES}`);
      if (next >= MAX_RETRIES) {
        console.error("[WATCHDOG] Max retries — showing error");
        setShowError(true);
      }
      setRetryCount(next);
      setMediaState("IMAGES");
    }, WATCHDOG_TIMEOUT_MS);

    return () => clearWatchdog();
  }, [mediaState]);

  // Auto-dismiss error after display duration
  useEffect(() => {
    if (!showError) return;
    const timer = setTimeout(() => {
      setShowError(false);
      setRetryCount(0);
    }, ERROR_DISPLAY_DURATION);
    return () => clearTimeout(timer);
  }, [showError]);

  // ── Playback callbacks ──────────────────────────────────────────────────────

  const handlePlaybackStarted = () => {
    console.log("[WATCHDOG] Playback confirmed — cancelled");
    clearWatchdog();
    setRetryCount(0);
  };

  const handleVideosFinished = () => {
    console.log("[MEDIA TIMER] Videos finished — back to IMAGES");
    clearWatchdog();
    setVideoIndex((prev) => prev + 1); // VideoComponent uses modulo internally
    requestAnimationFrame(() => setMediaState("IMAGES"));
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      {mediaState === "IMAGES" && <ImageComponent />}

      {mediaState === "VIDEOS" && (
        <VideoComponent
          videoIndex={videoIndex}
          onVideoFinished={handleVideosFinished}
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
