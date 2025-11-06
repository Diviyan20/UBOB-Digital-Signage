import { MediaStyles } from "@/styling/MediaStyles";
import { Image } from "expo-image";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import ErrorOverlayComponent from "./ErrorOverlayComponent";

interface MediaItem {
  name?: string;
  description?: string;
  image?: string | null;
  date_start?: string;
  date_end?: string;
}

const SERVER_URL = "http://10.0.2.2:5000"; // Emulator-safe
const DISPLAY_DURATION = 5000;
const FADE_DURATION = 400;

const ImageComponent: React.FC<{ endpoint?: string }> = ({
  endpoint = `${SERVER_URL}/get_media`,
}) => {
  const { width, height } = useWindowDimensions();
  const styles = MediaStyles(width, height);

  const [mediaList, setMediaList] = useState<MediaItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorVisible, setErrorVisible] = useState(false);

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const intervalRef =  useRef<ReturnType<typeof setInterval> | null>(null);
  const isMounted = useRef(true);

  // Helper to form valid image URL
  const getImageUrl = (path?: string | null) => {
    if (!path) return null;
    if (path.startsWith("http")) return `${path}?t=${Date.now()}`;
    return `${SERVER_URL}${path}?t=${Date.now()}`;
  };

  // Fetch from backend
  const fetchMediaList = async () => {
    try {
      const response = await fetch(endpoint);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const items = data.media || [];
      if (items.length === 0) throw new Error("No media found");
      if (isMounted.current) {
        setMediaList(items);
        setErrorVisible(false);
      }
    } catch (err) {
      console.error("❌ Media fetch error:", err);
      if (isMounted.current && mediaList.length === 0) setErrorVisible(true);
    } finally {
      if (isMounted.current) setLoading(false);
    }
  };

  // Prefetch next image for smoother transitions
  const preloadNextImage = (nextIndex: number) => {
    const nextUrl = getImageUrl(mediaList[nextIndex]?.image);
    if (!nextUrl) return;
    Image.prefetch(nextUrl).catch(() =>
      console.warn("⚠️ Prefetch failed for", nextUrl)
    );
  };

  // Advance carousel with fade animation
  const advanceOnce = () => {
    if (mediaList.length <= 1) return;
    const nextIndex = (currentIndex + 1) % mediaList.length;
    preloadNextImage(nextIndex);

    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: FADE_DURATION,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start(() => {
      if (!isMounted.current) return;
      setCurrentIndex(nextIndex);

      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: FADE_DURATION,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start();
    });
  };

  // Setup loop
  useEffect(() => {
    if (mediaList.length === 0) return;

    // Clear old interval if any
    if (intervalRef.current) clearInterval(intervalRef.current);

    const totalInterval = DISPLAY_DURATION + FADE_DURATION * 2;
    intervalRef.current = setInterval(advanceOnce, totalInterval);

    // Trigger first fade manually after DISPLAY_DURATION
    const firstTimeout = setTimeout(advanceOnce, DISPLAY_DURATION);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      clearTimeout(firstTimeout);
    };
  }, [mediaList, currentIndex]);

  // Fetch once on mount
  useEffect(() => {
    isMounted.current = true;
    fetchMediaList();
    return () => {
      isMounted.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const currentMedia = mediaList[currentIndex];
  const currentImageUrl = getImageUrl(currentMedia?.image);

  // --- States ---
  if (!currentMedia) {
    if (errorVisible) {
      return (
        <ErrorOverlayComponent
          visible={errorVisible}
          errorType="media_error"
          onRetry={() => {
            setErrorVisible(false);
            setLoading(true);
            fetchMediaList();
          }}
        />
      );
    }
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text>Loading media...</Text>
      </View>
    );
  }

  // --- Render ---
  return (
    <Animated.View style={[styles.card, { opacity: fadeAnim }]}>
      {currentImageUrl ? (
        <Image
        source={{ uri: getImageUrl(currentMedia.image)! }}
        style={styles.image}
        contentFit="contain"
        transition={170} // smooth fade-in
        cachePolicy="memory-disk" // cache images efficiently
      />
      ) : (
        <Text style={styles.placeholderText}>No Image</Text>
      )}

      <View style={styles.textContainer}>
        <Text style={styles.title}>{currentMedia.name || "Untitled"}</Text>
        {currentMedia.description ? (
          <Text style={styles.description} numberOfLines={3}>
            {currentMedia.description}
          </Text>
        ) : null}
      </View>
    </Animated.View>
  );
};

export default ImageComponent;
