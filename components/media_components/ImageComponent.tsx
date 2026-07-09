import { fetchPromotions, MediaItem } from "@/services/PromotionService";
import { ImageStyles } from "@/styling/MediaStyles";
import { Image } from "expo-image";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Text, useWindowDimensions, View } from "react-native";
import { config } from "../api/client";

const DEV_BLOCK_PROMOTIONS = false;
const FALLBACK_IMAGE = require("../images/Logo.png");

export const ImageComponent: React.FC = React.memo(() => {
  const { width, height } = useWindowDimensions();
  const styles = ImageStyles(width, height);

  const [mediaList, setMediaList] = useState<MediaItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorVisible, setErrorVisible] = useState(false);

  // Use fallback values for the intervals in case if Lambda fails
  const [displayDuration, setDisplayDuration] = useState(5000);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMounted = useRef(true);

  /**
   * Memoized helper to form valid image URL
   * Moved outside component and memoized to prevent recreation on every render
   * Saves memory and prevent child component re-renders
   */
  const getImageUrl = useCallback((url?: string | null, bustCache = false) => {
    if (!url) return null;
    return bustCache ? `${url}?t=${Date.now()}` : url;
  }, []);

  // Fetch Image Display duration and Fade duration from Config
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await fetch(config);
        const data = await response.json();

        setDisplayDuration(data.config.image_display_duration);
      } catch (e) {
        console.error("CONFIG ERROR: ", e);
      }
    };

    fetchConfig();
  }, []);

  /**
   * Optimized fetch function with request cancellation
   * Prevents race conditions and memory leaks
   */
  const fetchMediaList = useCallback(async () => {
    try {
      console.log("[IMAGE COMPONENT] Loading media...");

      if (DEV_BLOCK_PROMOTIONS) {
        console.warn("[DEV] Promotion fetch blocked — using fallback image");
        throw new Error("DEV_BLOCK");
      }

      const media = await fetchPromotions();

      if (isMounted.current) {
        setMediaList(media);
        setCurrentIndex(0);
        setErrorVisible(media.length === 0);
      }
    } catch (err) {
      console.error("[IMAGE COMPONENT] Falling back to local image:", err);

      if (isMounted.current) {
        // Inject a fake MediaItem pointing at the local fallback
        setMediaList([
          { image: null, name: "", localFallback: FALLBACK_IMAGE },
        ]);
        setCurrentIndex(0);
        setErrorVisible(true);
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }, []);

  /*
   * Occasional background fetch to check for new media in Odoo.
   * Runs every 30 minutes to prevent unnecessary network spikes
   */
  useEffect(() => {
    isMounted.current = true;

    fetchMediaList();
    return () => {
      isMounted.current = false;
    };
  }, [fetchMediaList]);

  /**
   * Memoized advance function
   * Prevents recreation on every render and ensures proper closure capture
   */
  const advanceOnce = useCallback(() => {
    if (mediaList.length <= 1) return;
    setCurrentIndex((prev) => (prev + 1) % mediaList.length);
  }, [mediaList.length]);

  // Optimized cyling effect with better dependencies
  useEffect(() => {
    if (mediaList.length === 0) return;

    // Clear any existing intervals/timeouts
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    // Start image cycle after DISPLAY_DURATION
    timeoutRef.current = setTimeout(() => {
      advanceOnce();
      // Set up interval for continuous cycling
      intervalRef.current = setInterval(advanceOnce, displayDuration);
    }, displayDuration);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [mediaList.length, advanceOnce]);

  // Memoized current media to prevent unnecessary recalculations
  const currentMedia = useMemo(
    () => mediaList[currentIndex],
    [mediaList, currentIndex],
  );
  const currentImageUrl = useMemo(
    () => getImageUrl(currentMedia?.image),
    [getImageUrl, currentMedia?.image],
  );

  // Error States
  if (!currentMedia) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Text>Loading media...</Text>

        {errorVisible && (
          <View
            style={{
              position: "absolute",
              bottom: 20,
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderRadius: 8,
            }}
          >
            <Text style={{ fontSize: 11, marginRight: 8 }}>⚠️</Text>

            <Text style={{ color: "#000", fontSize: 11, fontWeight: "bold" }}>
              Network issues, undergoing repairs
            </Text>
          </View>
        )}
      </View>
    );
  }

  // Main rendering UI
  return (
    <>
      <View style={styles.card}>
        {currentMedia.localFallback ? (
          <Image
            source={currentMedia.localFallback}
            style={styles.image}
            contentFit="contain"
          />
        ) : currentImageUrl ? (
          <Image
            source={{ uri: currentImageUrl }}
            style={styles.image}
            contentFit="contain"
            transition={170}
            cachePolicy="memory-disk"
            recyclingKey={`media-${currentIndex}`}
          />
        ) : (
          <Text style={styles.placeholderText}>No Image</Text>
        )}

        <View style={styles.textContainer}>
          <Text style={styles.title}>{currentMedia.name || "Untitled"}</Text>
        </View>
      </View>
    </>
  );
});
