import {
  OutletImageItem,
  fetchAndCacheOutletImages,
  getCachedOutletImages,
} from "@/services/OutletImageService";
import { OutletImageStyle } from "@/styling/OutletImageStyle";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "expo-image";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Animated, Text, View, useWindowDimensions } from "react-native";
import { config } from "../api/client";

const ITEMS_PER_PAGE = 7;
const SESSION_FETCHED_KEY = "outlet_images_session_fetched"; // Flag: did we already fetch this session?

export const OutletDisplayComponent: React.FC<{ endpoint?: string }> = React.memo(
  ({ endpoint }) => {
    const { width, height } = useWindowDimensions();
    const styles = OutletImageStyle(width, height);

    const [images, setImages] = useState<OutletImageItem[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [currentPage, setCurrentPage] = useState(0);
    const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());
    const [flipInterval, setFlipInterval] = useState(5000);
    const [fadeDuration, setFadeDuration] = useState(400);

    const flipAnim = useRef(new Animated.Value(0)).current;
    const isMounted = useRef(true);

    const pages = useMemo(() => {
      const result: OutletImageItem[][] = [];
      for (let i = 0; i < images.length; i += ITEMS_PER_PAGE) {
        result.push(images.slice(i, i + ITEMS_PER_PAGE));
      }
      return result;
    }, [images]);

    // Core logic: load cache immediately, fetch fresh only if this session hasn't fetched yet
    const loadImages = useCallback(async () => {
      setLoading(true);

      // Step 1: Load from cache right away so the screen isn't blank
      const cached = await getCachedOutletImages();
      if (isMounted.current && cached.length > 0) {
        setImages(cached);
        setLoading(false); // Show cached images immediately, don't make user wait
      }

      // Step 2: Check if we already fetched during this login session
      const alreadyFetched = await AsyncStorage.getItem(SESSION_FETCHED_KEY);

      if (!alreadyFetched) {
        // First time after login — fetch fresh data
        try {
          const fresh = await fetchAndCacheOutletImages(endpoint);
          if (isMounted.current) {
            setImages(fresh);
            setImageErrors(new Set()); // Clear any stale errors
          }
          // Mark that we've fetched for this session
          await AsyncStorage.setItem(SESSION_FETCHED_KEY, "true");
        } catch (err) {
          console.error("[OUTLET IMAGE FETCH ERROR] Fresh fetch failed, using cache:", err);
          // Cache is already loaded above — nothing extra needed here
        }
      }

      if (isMounted.current) setLoading(false);
    }, [endpoint]);

    useEffect(() => {
      isMounted.current = true;
      loadImages();
      return () => {
        isMounted.current = false;
      };
    }, [loadImages]);

    // Config fetch (flip interval + fade duration)
    useEffect(() => {
      const fetchConfig = async () => {
        try {
          const response = await fetch(config);
          const data = await response.json();
          setFlipInterval(data.config.outlet_image_flip_interval);
          setFadeDuration(data.config.fade_duration);
        } catch (e) {
          console.error("CONFIG ERROR: ", e);
        }
      };
      fetchConfig();
    }, []);

    // Flip animation
    useEffect(() => {
      if (pages.length <= 1) return;

      const interval = setInterval(() => {
        Animated.timing(flipAnim, {
          toValue: 0.5,
          duration: fadeDuration,
          useNativeDriver: true,
        }).start(() => {
          setCurrentPage((prev) => (prev + 1) % pages.length);
          Animated.timing(flipAnim, {
            toValue: 0,
            duration: fadeDuration,
            useNativeDriver: true,
          }).start();
        });
      }, flipInterval);

      return () => clearInterval(interval);
    }, [pages.length, flipAnim, fadeDuration, flipInterval]); // Added missing deps

    const handleImageError = useCallback((imageId: string) => {
      setImageErrors((prev) => {
        const next = new Set(prev);
        next.add(imageId);
        return next;
      });
    }, []);

    const opacity = flipAnim.interpolate({
      inputRange: [0, 0.5],
      outputRange: [1, 0],
    });

    const scale = flipAnim.interpolate({
      inputRange: [0, 0.5],
      outputRange: [1, 0.92],
    });

    if (loading && images.length === 0) return <Text>Loading Images...</Text>;
    if (images.length === 0) return <Text>No images available.</Text>;

    const currentItems = pages[currentPage] || [];

    return (
      <View style={styles.container}>
        <View style={styles.cardFrame}>
          <Animated.View
            style={[styles.pageContainer, { opacity, transform: [{ scale }] }]}
          >
            {currentItems.map((item, i) => {
              const imageId = item.id || item.outlet_id || `image-${i}`;
              const uri = item.image;
              const hasError = imageErrors.has(imageId);

              return (
                <View key={imageId} style={{ alignItems: "center", marginHorizontal: 8 }}>
                  <Animated.View
                    style={[
                      styles.imageWrapper,
                      {
                        shadowOpacity: flipAnim.interpolate({
                          inputRange: [0, 0.5],
                          outputRange: [0.2, 0],
                        }),
                        backgroundColor: flipAnim.interpolate({
                          inputRange: [0, 0.5],
                          outputRange: ["#ffffff", "transparent"],
                        }),
                      },
                    ]}
                  >
                    {uri && !hasError ? (
                      <Image
                        source={{ uri }}
                        style={styles.image}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        recyclingKey={imageId}
                        priority="low"
                        onError={() => handleImageError(imageId)}
                      />
                    ) : (
                      <View
                        style={[
                          styles.image,
                          { justifyContent: "center", alignItems: "center", backgroundColor: "#f0f0f0" },
                        ]}
                      >
                        <Text style={styles.placeholder}>No Image</Text>
                      </View>
                    )}
                  </Animated.View>

                  <Text
                    style={{
                      textAlign: "center",
                      marginTop: 6,
                      fontSize: 11,
                      fontWeight: "bold",
                      color: "#333",
                      width: Math.min(85, width * 0.15),
                      lineHeight: 12,
                      textTransform: "uppercase",
                    }}
                    numberOfLines={2}
                    ellipsizeMode="tail"
                  >
                    {item.outlet_name || "Unnamed Outlet"}
                  </Text>
                </View>
              );
            })}
          </Animated.View>
        </View>
      </View>
    );
  }
);