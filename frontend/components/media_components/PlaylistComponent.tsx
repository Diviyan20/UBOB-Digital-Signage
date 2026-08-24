import {
  deletePlaylistFiles,
  getMediaDownloadState,
  loadAvailablePlaylist,
  PlaylistItems,
  refreshMediaPlayerPlaylist,
  registerMediaRetryFailure,
} from "@/frontend/services/MediaService";
import { PlaylistStyles as styles } from "@/styling/MediaStyles";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useEffect, useRef, useState } from "react";
import { Alert, Animated, AppState, Easing, Text, View } from "react-native";
import { api } from "../api/client";

type PlaybackMode = "loading" | "video" | "image" | "empty";
type OrientationType = "Landscape" | "Portrait";

const LOGIN_ROUTE = "/";
const DEFAULT_VERSION_CHECK_INTERVAL_MS = 5 * 60 * 60 * 1000;
const SCHEDULE_CHECK_INTERVAL_MS = 30 * 1000;

// =============================================================================
// Schedule evaluation
// =============================================================================

/*
 * Extract a UTC clock time from a Daily schedule.
 *
 * Daily schedules are stored by the backend using a placeholder date
 * (1970-01-01) and a UTC time.
 *
 * Example:
 *
 *   1970-01-01T10:26:00+00:00
 *
 * We only care about: 10:26 UTC
 *
 * We deliberately use UTC here instead of Date.getHours(), because
 * Date.getHours() converts the value into the TV's local timezone.
 */

const getDailyTimeMinutes = (value: string): number | null => {
  if (!value) return null;

  /*
   * First try to extract HH:mm directly from the ISO string.
   *
   * This avoids timezone conversion entirely.
   *
   * Examples:
   *
   * 1970-01-01T10:26:00+00:00
   *                   ^^ ^^
   *
   * 1970-01-01T15:15:00Z
   *                   ^^ ^^
   */
  const match = value.match(
    /T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?$/,
  );

  if (match) {
    const hours = Number(match[1]);
    const minutes = Number(match[2]);

    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return hours * 60 + minutes;
    }
  }

  /*
   * Fallback for formats that aren't ISO timestamps.
   */
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return null;

  return date.getUTCHours() * 60 + date.getUTCMinutes();
};

/**
 * Check whether a Daily schedule is currently active.
 *
 * Daily schedules repeat every day.
 *
 * Example:
 *
 *   15:15 -> 15:20
 *
 * means:
 *
 *   15:15-15:20 every day.
 *
 * The comparison is performed using UTC because the backend's
 * time-only values are serialized as UTC.
 */
const isWithinDailyWindow = (
  startMinutes: number,
  endMinutes: number,
  now = new Date(),
): boolean => {
  const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();

  /*
   * Same start/end means the configured
   * schedule occupies the whole day.
   */
  if (startMinutes === endMinutes) return true;

  /*
   * Normal window.
   *
   * Example:
   *
   * 15:15 -> 15:20
   */
  if (startMinutes < endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes <= endMinutes;
  }

  /*
   * Cross-midnight window.
   *
   * Example:
   *
   * 23:00 -> 02:00
   */
  return nowMinutes >= startMinutes || nowMinutes <= endMinutes;
};

/**
 * Check whether an LTO schedule is currently active.
 *
 * LTO is NOT a repeating clock window.
 *
 * Example:
 *
 *   2026-08-20 15:15 -> 2026-08-25 20:00
 *
 * Therefore we compare the complete timestamp.
 */
const isWithinLtoWindow = (
  startValue: string,
  endValue: string,
  now = new Date(),
): boolean => {
  const start = new Date(startValue);
  const end = new Date(endValue);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    console.warn("[SCHEDULE] Invalid LTO datetime:", {
      startValue,
      endValue,
    });

    return false;
  }

  /*
   * LTO should contain a real calendar date.
   *
   * If the backend accidentally sends 1970,
   * that is a backend serialization problem rather
   * than a valid LTO schedule.
   */
  if (start.getUTCFullYear() === 1970 || end.getUTCFullYear() === 1970) {
    console.warn(
      "[SCHEDULE] LTO received a 1970 placeholder date. " +
        "LTO requires real calendar dates.",
      {
        startValue,
        endValue,
      },
    );

    return false;
  }

  return now.getTime() >= start.getTime() && now.getTime() <= end.getTime();
};

const isMediaScheduledNow = (
  item: PlaylistItems,
  now = new Date(),
): boolean => {
  switch (item.frequency) {
    // -------------------------------------------------------------------------
    // Evergreen
    // -------------------------------------------------------------------------

    case "Evergreen":
      return true;

    // -------------------------------------------------------------------------
    // Daily
    // -------------------------------------------------------------------------

    case "Daily": {
      if (!item.startDatetime || !item.endDatetime) {
        console.warn(
          `[SCHEDULE] ${item.fileName} has Daily frequency but missing start/end time.`,
        );

        return false;
      }

      const startMinutes = getDailyTimeMinutes(item.startDatetime);

      const endMinutes = getDailyTimeMinutes(item.endDatetime);

      if (startMinutes === null || endMinutes === null) {
        console.warn(`[SCHEDULE] ${item.fileName} has invalid Daily time.`, {
          start: item.startDatetime,
          end: item.endDatetime,
        });

        return false;
      }

      const active = isWithinDailyWindow(startMinutes, endMinutes, now);

      console.log(
        `[SCHEDULE] Daily ${item.fileName} | ` +
          `start=${item.startDatetime} | ` +
          `end=${item.endDatetime} | ` +
          `currentUTC=${now.toISOString()} | ` +
          `active=${active}`,
      );

      return active;
    }

    // -------------------------------------------------------------------------
    // LTO
    // -------------------------------------------------------------------------

    case "LTO": {
      if (!item.startDatetime || !item.endDatetime) {
        console.warn(
          `[SCHEDULE] ${item.fileName} has LTO frequency but missing start/end datetime.`,
        );

        return false;
      }

      const active = isWithinLtoWindow(
        item.startDatetime,
        item.endDatetime,
        now,
      );

      console.log(
        `[SCHEDULE] LTO ${item.fileName} | ` +
          `start=${item.startDatetime} | ` +
          `end=${item.endDatetime} | ` +
          `current=${now.toISOString()} | ` +
          `active=${active}`,
      );

      return active;
    }

    default:
      console.warn(
        `[SCHEDULE] Unknown frequency for ${item.fileName}: ${item.frequency}`,
      );

      return false;
  }
};

const buildPlayablePlaylist = (allMedia: PlaylistItems[]): PlaylistItems[] => {
  const now = new Date();

  console.log(
    `[SCHEDULE] Evaluating ${allMedia.length} media item(s) at ${now.toISOString()}`,
  );

  const playable = allMedia.filter((item) => isMediaScheduledNow(item, now));

  console.log(
    `[SCHEDULE] ${playable.length}/${allMedia.length} media item(s) currently active`,
  );

  return playable;
};

// =============================================================================
// Component
// =============================================================================

export const PlaylistComponent: React.FC = () => {
  const [allMedia, setAllMedia] = useState<PlaylistItems[]>([]);
  const [playlist, setPlaylist] = useState<PlaylistItems[]>([]);
  const [mode, setMode] = useState<PlaybackMode>("loading");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [displayDuration, setDisplayDuration] = useState(5000);
  const [fadeDuration, setFadeDuration] = useState(400);
  const [orientation, setOrientation] = useState<OrientationType>("Landscape");
  const [versionCheckInterval, setVersionCheckInterval] = useState(
    DEFAULT_VERSION_CHECK_INTERVAL_MS,
  );

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const currentIndexRef = useRef(0);
  const playlistRef = useRef<PlaylistItems[]>([]);
  const allMediaRef = useRef<PlaylistItems[]>([]);
  const pendingDeleteRef = useRef<string[]>([]);
  const refreshRunningRef = useRef(false);
  const downloadErrorShownRef = useRef(false);

  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
  });

  // ---------------------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const response = await fetch(api.config);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(`Config request failed: ${response.status}`);
        }

        setDisplayDuration(data.config?.image_display_duration ?? 5000);

        setFadeDuration(data.config?.fade_duration ?? 400);

        const versionCheck = data.config?.version_check;

        if (typeof versionCheck === "number" && versionCheck > 0) {
          setVersionCheckInterval(versionCheck);

          console.log(`[CONFIG] version_check = ${versionCheck}ms`);
        } else {
          console.warn(
            `[CONFIG] Invalid version_check. Using fallback ${DEFAULT_VERSION_CHECK_INTERVAL_MS}ms`,
          );
        }
      } catch (error) {
        console.warn(
          "[CONFIG] Failed to load configuration. Using defaults.",
          error,
        );
      }
    };

    void loadConfig();
  }, []);

  // ---------------------------------------------------------------------------
  // Orientation
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const loadOrientation = async () => {
      const saved = await AsyncStorage.getItem("orientation");

      if (saved === "Portrait" || saved === "Landscape") {
        setOrientation(saved);
      }
    };

    void loadOrientation();
  }, []);

  // ---------------------------------------------------------------------------
  // Update local active playlist without unnecessarily restarting media.
  // ---------------------------------------------------------------------------

  const applyAllMedia = (
    nextAllMedia: PlaylistItems[],
    forceImmediateSwitch = false,
  ) => {
    allMediaRef.current = nextAllMedia;
    setAllMedia(nextAllMedia);

    const nextPlayable = buildPlayablePlaylist(nextAllMedia);

    const currentItem = playlistRef.current[currentIndexRef.current];

    playlistRef.current = nextPlayable;
    setPlaylist(nextPlayable);

    if (nextPlayable.length === 0) {
      currentIndexRef.current = 0;
      setCurrentIndex(0);
      setMode("empty");
      return;
    }

    const currentIndexInNext = currentItem
      ? nextPlayable.findIndex(
          (item) => item.mediaUuid === currentItem.mediaUuid,
        )
      : -1;

    if (currentIndexInNext >= 0) {
      currentIndexRef.current = currentIndexInNext;
      setCurrentIndex(currentIndexInNext);

      // Keep the currently playing item if it is still eligible.
      return;
    }

    // Current item is no longer eligible or this is first load.
    const nextIndex = 0;

    currentIndexRef.current = nextIndex;
    setCurrentIndex(nextIndex);

    // The current media is no longer valid, so the player must switch to the
    // new item's actual type immediately. Otherwise an image can be treated
    // as a video (or vice versa) for one render cycle.
    if (forceImmediateSwitch || currentItem != null) {
      setMode(nextPlayable[nextIndex].type);
    }
  };

  // ---------------------------------------------------------------------------
  // Initial local playlist
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const loadPlaylist = async () => {
      try {
        const items = await loadAvailablePlaylist();

        if (items.length === 0) {
          console.warn("[PLAYER] No locally available media found");
          setMode("empty");
          return;
        }

        console.log(
          `[PLAYER] Loaded ${items.length} locally available media item(s)`,
        );

        allMediaRef.current = items;
        setAllMedia(items);

        const playable = buildPlayablePlaylist(items);

        playlistRef.current = playable;
        setPlaylist(playable);
        currentIndexRef.current = 0;
        setCurrentIndex(0);

        if (playable.length > 0) {
          setMode(playable[0].type);
        } else {
          setMode("empty");
        }
      } catch (error) {
        console.error("[PLAYER] Failed to load local playlist:", error);
        setMode("empty");
      }
    };

    void loadPlaylist();
  }, []);

  // ---------------------------------------------------------------------------
  // Watch background downloads
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const state = await getMediaDownloadState();

        if (state.status === "error" && !downloadErrorShownRef.current) {
          downloadErrorShownRef.current = true;

          const retry = await registerMediaRetryFailure();

          if (retry.blocked) {
            Alert.alert(
              "Network Connectivity Error",
              "Network connectivity error. No tries left.",
            );
          } else {
            const triesLeft = Math.max(0, 5 - retry.retryCount);

            Alert.alert(
              "Network Connectivity Error",
              `Network connectivity error. ${triesLeft} ${triesLeft === 1 ? "try" : "tries"} left.`,
              [
                {
                  text: "Retry",
                  onPress: () => router.replace(LOGIN_ROUTE),
                },
              ],
            );
          }

          return;
        }

        const available = await loadAvailablePlaylist();

        if (available.length === allMediaRef.current.length) {
          return;
        }

        if (available.length === 0) {
          return;
        }

        console.log(
          `[PLAYER] New local media available: ${available.length} item(s)`,
        );

        applyAllMedia(available);
      } catch (error) {
        console.warn("[PLAYER] Failed to watch background downloads:", error);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // ---------------------------------------------------------------------------
  // Schedule refresh
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const refreshSchedule = () => {
      if (allMediaRef.current.length === 0) {
        return;
      }

      console.log("[SCHEDULE] Re-evaluating active media");

      applyAllMedia(allMediaRef.current, false);
    };

    const timer = setInterval(refreshSchedule, SCHEDULE_CHECK_INTERVAL_MS);

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        refreshSchedule();
      }
    });

    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Single item loops. Multiple items use playToEnd.
  // ---------------------------------------------------------------------------

  useEffect(() => {
    player.loop = mode === "video" && playlistRef.current.length === 1;
  }, [mode, playlist.length, player]);

  // ---------------------------------------------------------------------------
  // Play current item
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (mode !== "video") {
      return;
    }

    const item = playlistRef.current[currentIndexRef.current];

    if (!item?.localUri) {
      return;
    }

    const play = async () => {
      try {
        console.log(
          `[PLAYER] Playing: ${item.fileName} | frequency=${item.frequency} | start=${item.startDatetime ?? "-"} | end=${item.endDatetime ?? "-"}`,
        );

        player.loop = playlistRef.current.length === 1;

        await player.replaceAsync(item.localUri);

        player.play();
      } catch (error) {
        console.error(`[PLAYER] Failed to play ${item.fileName}:`, error);
      }
    };

    void play();
  }, [mode, currentIndex, player]);

  // ---------------------------------------------------------------------------
  // Advance on video end
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const subscription = player.addListener("playToEnd", () => {
      const items = playlistRef.current;

      if (items.length <= 1) {
        return;
      }

      const nextIndex = (currentIndexRef.current + 1) % items.length;

      currentIndexRef.current = nextIndex;

      setCurrentIndex(nextIndex);

      setMode(items[nextIndex].type);

      void cleanupPendingFiles(items[nextIndex].localUri);
    });

    return () => subscription.remove();
  }, [player]);

  // ---------------------------------------------------------------------------
  // Cleanup obsolete files
  // ---------------------------------------------------------------------------

  const cleanupPendingFiles = async (activeLocalUri?: string) => {
    if (pendingDeleteRef.current.length === 0) {
      return;
    }

    const files = pendingDeleteRef.current;

    await deletePlaylistFiles(files, activeLocalUri);

    pendingDeleteRef.current = files.filter((file) => file === activeLocalUri);
  };

  // ---------------------------------------------------------------------------
  // Incremental server refresh
  // ---------------------------------------------------------------------------

  const refreshPlaylist = async () => {
    if (refreshRunningRef.current) {
      return;
    }

    refreshRunningRef.current = true;

    try {
      console.log("[REFRESH] Checking Media Player configuration version...");

      const result = await refreshMediaPlayerPlaylist();

      if (!result.changed) {
        return;
      }

      const currentItem = playlistRef.current[currentIndexRef.current];

      pendingDeleteRef.current = result.oldFilesToDelete;

      console.log(
        `[REFRESH] New configuration contains ${result.playlist.length} item(s)`,
      );

      allMediaRef.current = result.playlist;
      setAllMedia(result.playlist);

      // Rebuild the active schedule from the new config.
      const activePlaylist = buildPlayablePlaylist(result.playlist);

      playlistRef.current = activePlaylist;
      setPlaylist(activePlaylist);

      if (activePlaylist.length === 0) {
        currentIndexRef.current = 0;
        setCurrentIndex(0);
        setMode("empty");
      } else if (currentItem) {
        const newIndex = activePlaylist.findIndex(
          (item) => item.mediaUuid === currentItem.mediaUuid,
        );

        if (newIndex >= 0) {
          // Continue the current media.
          currentIndexRef.current = newIndex;
          setCurrentIndex(newIndex);
        } else {
          // Current media was removed or became inactive.
          currentIndexRef.current = 0;
          setCurrentIndex(0);
          setMode(activePlaylist[0].type);
        }
      } else {
        currentIndexRef.current = 0;
        setCurrentIndex(0);
        setMode(activePlaylist[0].type);
      }

      await cleanupPendingFiles(currentItem?.localUri);
    } catch (error) {
      // Server refresh failure must not interrupt local playback.
      console.warn(
        "[REFRESH] Failed to refresh Media Player configuration. Keeping current media.",
        error,
      );
    } finally {
      refreshRunningRef.current = false;
    }
  };

  // ---------------------------------------------------------------------------
  // DB-driven version check
  // ---------------------------------------------------------------------------

  useEffect(() => {
    console.log(`[VERSION CHECK] Running every ${versionCheckInterval}ms`);

    const timer = setInterval(() => {
      void refreshPlaylist();
    }, versionCheckInterval);

    return () => clearInterval(timer);
  }, [versionCheckInterval]);

  // ---------------------------------------------------------------------------
  // Image playback
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (mode !== "image") {
      return;
    }

    const item = playlistRef.current[currentIndexRef.current];

    if (!item) {
      return;
    }

    fadeAnim.setValue(1);

    const timer = setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: fadeDuration,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start(() => {
        const items = playlistRef.current;

        if (items.length === 0) {
          setMode("empty");
          return;
        }

        if (items.length === 1) {
          fadeAnim.setValue(1);
          return;
        }

        const nextIndex = (currentIndexRef.current + 1) % items.length;

        currentIndexRef.current = nextIndex;

        setCurrentIndex(nextIndex);
        setMode(items[nextIndex].type);

        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: fadeDuration,
          easing: Easing.linear,
          useNativeDriver: true,
        }).start();
      });
    }, displayDuration);

    return () => clearTimeout(timer);
  }, [mode, currentIndex, displayDuration, fadeDuration, fadeAnim]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const renderMedia = () => {
    if (mode === "loading") {
      return <Text style={styles.statusText}>Loading media...</Text>;
    }

    if (mode === "empty") {
      return <Text style={styles.statusText}>No media scheduled.</Text>;
    }

    const currentItem = playlist[currentIndex];

    if (!currentItem) {
      return null;
    }

    if (mode === "video") {
      return (
        <VideoView
          player={player}
          style={styles.media}
          contentFit="contain"
          nativeControls={false}
        />
      );
    }

    return (
      <Animated.View
        style={[
          styles.media,
          {
            opacity: fadeAnim,
          },
        ]}
      >
        <Image
          source={{
            uri: currentItem.localUri,
          }}
          style={styles.media}
          contentFit="contain"
          cachePolicy="memory"
        />
      </Animated.View>
    );
  };

  const cardStyle =
    orientation === "Portrait" ? styles.portraitCard : styles.landscapeCard;

  return (
    <View style={styles.screen}>
      <View style={cardStyle}>{renderMedia()}</View>
    </View>
  );
};
