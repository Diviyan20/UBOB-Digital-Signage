import { MediaStyles } from "@/styling/MediaStyles";
import { Image } from "expo-image";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const SERVER_URL = "https://ubob-digital-signage.onrender.com";
const DISPLAY_DURATION = 5000;
const FADE_DURATION = 400;
const PREFETCH_BUFFER = 2 //Only Pre-fetches next 2 images instead of all

const ImageComponent: React.FC<{ endpoint?: string }> = React.memo(({
  endpoint = `${SERVER_URL}/get_media`,
}) => {
  const { width, height } = useWindowDimensions();
  const styles = MediaStyles(width, height);

  const [mediaList, setMediaList] = useState<MediaItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorVisible, setErrorVisible] = useState(false);

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMounted = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * Memozied helper to form valid image URL
   * Moved outside component and memoized to prevent recreation on every render
   * Saves memory and prevent child component re-renders
   */
  const getImageUrl = useCallback((path?: string | null, bustCache = false) => {
    if (!path) return null;
    if (path.startsWith("http")) {
      return bustCache ? `${path}?t=${Date.now()}` : path;
    }
    return bustCache
      ? `${SERVER_URL}${path}?t=${Date.now()}`
      : `${SERVER_URL}${path}`;
  },[]);

  /**
   * Optimized fetch function with request cancellation
   * Uses AbortController to cancle previous requests if component unmounts
   * Prevents race conditions and memory leaks
   */ 
  const fetchMediaList = useCallback(async () => {
    // Cancel any ongoing request
    if (abortControllerRef.current){
      abortControllerRef.current.abort();
    }

    //Create new abort controller for this request
    abortControllerRef.current = new AbortController();

    try {
        const response = await fetch(endpoint,{
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) console.log(`HTTP ${response.status}`);
        const data = await response.json();
        const items = data.media || [];

        if (items.length === 0) console.error("Error: No media found");

        if (isMounted.current){
          setMediaList(items);
          setErrorVisible(false);
          setCurrentIndex(0); // Reset to first image
        }
      
    } catch (err) {
      // Do not log abort errors (They're expected)
      if (err instanceof Error && err.name === "AbortError") return;

      console.error("Media Fetch Error: ", err);
      if (isMounted.current && mediaList.length === 0) setErrorVisible(true);
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, [endpoint, mediaList.length]);

  /** 
   * Smart prefetching - only prefetches next few image
   * More efficient than prefetching all at once
   * Reduces memory usage and network load
   * 
  */
 const prefetchImages = useCallback((startIndex: number, count: number) =>{
  if (mediaList.length === 0) return;

  // Calculate which images to prefetch (circular buffer)
  const prefetchPromises = [];
  for (let i =0; i< count; i++){
    const index = (startIndex + 1) %  mediaList.length;
    const url = getImageUrl(mediaList[index]?.image);
    if (url){
        prefetchPromises.push(
        Image.prefetch(url).catch(() => null) // Ignore prefetch failures
      );
    }
  }
  Promise.all(prefetchPromises).then(() =>{
    console.log(`✅ Prefetched next ${count} images`);
  });
 }, [mediaList, getImageUrl]);

  /**
   * Memoized advance function
   * Prevents recreation on every render and ensures proper closure capture
   * 
  */
  const advanceOnce = useCallback(() => {
    if (mediaList.length <= 1) return;

    const nextIndex = (currentIndex + 1) % mediaList.length;

    //Prefetch next images before advancing
    prefetchImages(nextIndex, PREFETCH_BUFFER);

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
  },[mediaList.length, currentIndex, prefetchImages, fadeAnim]);

  // Initial prefetch when media list loads
  useEffect(() => {
    if (mediaList.length === 0) return;
    prefetchImages(0, Math.min(PREFETCH_BUFFER + 1, mediaList.length));
  }, [mediaList, prefetchImages]);

  // Component mount/unmount cleanup
  useEffect(() => {
    isMounted.current = true;

    // Fetch initial data
    fetchMediaList();

    return () =>{
      isMounted.current = false;
      
      // Cancel any ongoing requests
      if (abortControllerRef.current){
        abortControllerRef.current.abort();
      }
    };
  }, [fetchMediaList]);

  // Optimized cyling effect with better dependencies
  useEffect(() => {
    if (mediaList.length === 0) return;

    // Clear any existing intervals/timeouts
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    const totalInterval = DISPLAY_DURATION + FADE_DURATION * 2;

    // Start image cycle after DISPLAY_DURATION
    timeoutRef.current = setTimeout(() => {
      advanceOnce();
      // Set up interval for continuous cycling
      intervalRef.current = setInterval(advanceOnce, totalInterval);
    }, DISPLAY_DURATION);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [mediaList.length, advanceOnce]);

  // Memoized current media to prevent unnecessary recalculations
  const currentMedia = useMemo(() => mediaList[currentIndex], [mediaList, currentIndex]);
  const currentImageUrl = useMemo(() => getImageUrl(currentMedia?.image), [getImageUrl, currentMedia?.image]);

  // Error States
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

  // Main rendering UI
  return (
    <Animated.View style={[styles.card, { opacity: fadeAnim }]}>
      {currentImageUrl ? (
        <Image
          source={{ uri: currentImageUrl }}
          style={styles.image}
          contentFit="contain"
          transition={170}
          cachePolicy="memory-disk"
          recyclingKey={`media-${currentIndex}`} // Added for memory efficiency
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
});

ImageComponent.displayName = 'ImageComponent' // For debugging

export default ImageComponent;