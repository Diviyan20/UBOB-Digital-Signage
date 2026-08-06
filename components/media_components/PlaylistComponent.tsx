import { fetchPlaylist, PlaylistItems } from "@/services/MediaService";
import { PlaylistStyles as styles } from "@/styling/MediaStyles";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  AppState,
  AppStateStatus,
  Easing,
  Text,
  View,
} from "react-native";
import { config } from "../api/client";

const VERSION_CHECK_INTERVAL_MS = 10 * 60 * 1000; // 30 minutes

interface VideoEntry {
  url: string; // CloudFront URL (kept for reference)
  localUri: string; // local file:// path — what the player uses
}
interface ImageEntry {
  url: string;
  localUri: string;
}

type PlaybackMode = "loading" | "video" | "image" | "empty";
type OrientationType = "Landscape" | "Portrait";

export const PlaylistComponent: React.FC = () => {
  const [mode, setMode] = useState<PlaybackMode>("loading");
  const [videos, setVideos] = useState<VideoEntry[]>([]);
  const [images, setImages] = useState<ImageEntry[]>([]);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const [displayDuration, setDisplayDuration] = useState(5000);
  const [fadeDuration, setFadeDuration] = useState(400);
  const [orientation, setOrientation] = useState<OrientationType>("Landscape");

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const isMounted = useRef(true);
  const appStateRef = useRef(AppState.currentState);

  const videosRef = useRef<VideoEntry[]>([]);
  const imagesRef = useRef<ImageEntry[]>([]);

  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
  });

  const fetchConfig = useCallback(async () => {
    try {
      const response = await fetch(config);
      const data = await response.json();
      setDisplayDuration(data.config.image_display_duration);
      setFadeDuration(data.config.fade_duration);
    } catch {
      // Fallback values already in state
    }
  }, []);

  const loadPlaylist = useCallback(async () => {
    const playlist: PlaylistItems[] = await fetchPlaylist();
    console.log(`[PLAYLIST] Loaded ${playlist.length} items`);

    // Separate by type — use localUri for playback
    const fetchedVideos = playlist
      .filter((item) => item.type === "video")
      .map((item) => ({ url: item.url, localUri: item.localUri }));

    const fetchedImages = playlist
      .filter((item) => item.type === "image")
      .map((item) => ({ url: item.url, localUri: item.localUri }));

    return { fetchedVideos, fetchedImages };
  }, []);

  const initialize = useCallback(async () => {
    if (!isMounted.current) return;
    setMode("loading");

    const savedOrientation = await AsyncStorage.getItem("orientation");
    if (savedOrientation === "Portrait" || savedOrientation === "Landscape") {
      setOrientation(savedOrientation);
    }

    await fetchConfig();
    const { fetchedVideos, fetchedImages } = await loadPlaylist();

    if (!isMounted.current) return;

    videosRef.current = fetchedVideos;
    imagesRef.current = fetchedImages;

    setVideos(fetchedVideos);
    setImages(fetchedImages);
    setCurrentVideoIndex(0);
    setCurrentImageIndex(0);
    fadeAnim.setValue(1);

    if (fetchedVideos.length > 0) {
      setMode("video");
    } else if (fetchedImages.length > 0) {
      setMode("image");
    } else {
      setMode("empty");
    }
  }, [fetchConfig, loadPlaylist, fadeAnim]);

  // Mount + resume from background
  useEffect(() => {
    isMounted.current = true;
    initialize();

    const subscription = AppState.addEventListener(
      "change",
      (nextState: AppStateStatus) => {
        if (
          appStateRef.current.match(/inactive|background/) &&
          nextState === "active"
        ) {
          initialize();
        }
        appStateRef.current = nextState;
      },
    );

    return () => {
      isMounted.current = false;
      subscription.remove();
    };
  }, [initialize]);

  // Load video into player — uses localUri
  useEffect(() => {
    if (mode !== "video" || videosRef.current.length === 0) return;

    const localUri = videosRef.current[currentVideoIndex]?.localUri;
    if (!localUri) return;

    const load = async () => {
      try {
        player.loop =
          videosRef.current.length === 1 && imagesRef.current.length === 0;
        await player.replaceAsync(localUri);
        player.play();
      } catch (err) {
        console.error("Failed to load video:", err);
      }
    };

    load();
  }, [currentVideoIndex, mode]);

  // Advance to next video on end
  useEffect(() => {
    if (mode !== "video") return;

    if (videosRef.current.length === 1 && imagesRef.current.length === 0) {
      return; // Single looping video — listener not needed
    }

    const subscription = player.addListener("playToEnd", () => {
      if (!isMounted.current) return;

      const nextIndex = currentVideoIndex + 1;
      if (nextIndex < videosRef.current.length) {
        setCurrentVideoIndex(nextIndex);
      } else {
        setCurrentVideoIndex(0);
        setMode(imagesRef.current.length > 0 ? "image" : "video");
      }
    });

    return () => subscription.remove();
  }, [player, currentVideoIndex, mode]);

  // Image cycling
  useEffect(() => {
    if (mode !== "image" || imagesRef.current.length === 0) return;

    if (imagesRef.current.length === 1 && videosRef.current.length === 0) {
      fadeAnim.setValue(1);
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
        if (!isMounted.current) return;

        const nextIndex = currentImageIndex + 1;
        if (nextIndex >= imagesRef.current.length) {
          setCurrentImageIndex(0);
          setMode(videosRef.current.length > 0 ? "video" : "image");
        } else {
          setCurrentImageIndex(nextIndex);
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: fadeDuration,
            easing: Easing.linear,
            useNativeDriver: true,
          }).start();
        }
      });
    }, displayDuration);

    return () => clearTimeout(timer);
  }, [mode, currentImageIndex, displayDuration, fadeDuration]);

  // Periodic version check — fetchPlaylist handles etag internally
  useEffect(() => {
    const interval = setInterval(() => {
      console.log("[VERSION CHECK] Periodic refresh — checking for updates...");
      initialize();
    }, VERSION_CHECK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [initialize]);

  // ─── Render ───────────────────────────────────────────────────────────────

  const renderMedia = () => {
    if (mode === "loading") {
      return <Text style={styles.statusText}>Loading media...</Text>;
    }

    if (mode === "empty") {
      return <Text style={styles.statusText}>No media available.</Text>;
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

    if (mode === "image") {
      const localUri = images[currentImageIndex]?.localUri;
      return (
        <Animated.View style={[styles.media, { opacity: fadeAnim }]}>
          <Image
            source={{ uri: localUri }}
            style={styles.media}
            contentFit="contain"
            cachePolicy="memory"
            recyclingKey={`image-${currentImageIndex}`}
          />
        </Animated.View>
      );
    }

    return null;
  };

  const cardStyle =
    orientation === "Portrait" ? styles.portraitCard : styles.landscapeCard;

  return (
    <View style={styles.screen}>
      <View style={cardStyle}>{renderMedia()}</View>
    </View>
  );
};
