import { OutletImageStyle } from "@/styling/OutletImageStyle";
import { Image } from "expo-image";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Animated, Text, View, useWindowDimensions } from "react-native";
import { api } from "../api/client";

interface ImageItem {
  id?: string;
  image?: string | null;
  outlet_name?: string;
  outlet_id?: string;
}

const ITEMS_PER_PAGE = 7 // How many outlets shown at once
const FLIP_INTERVAL = 10000 // 5 seconds before flipping to the next set

const OutletDisplayComponent: React.FC<{ endpoint?: string }> = React.memo(
  ({ endpoint = api.outletImages }) => {
    const { width, height } = useWindowDimensions();
    const styles = OutletImageStyle(width, height);

    const [images, setImages] = useState<ImageItem[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [currentPage, setCurrentPage] = useState(0);
    const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());

    const flipAnim = useRef(new Animated.Value(0)).current;
    const isMounted = useRef(true);
    const abortControllerRef = useRef<AbortController | null>(null);

    // Split images into pages of ITEMS_PER_PAGE
    const pages = useMemo(() =>{
      const result: ImageItem[][] = [];
      for (let i=0; i < images.length; i+= ITEMS_PER_PAGE){
          result.push(images.slice(i, i + ITEMS_PER_PAGE));
      }

      return result;
    }, [images]);

    const fetchOutletImages = useCallback(async () => {
      if (abortControllerRef.current) abortControllerRef.current.abort();
      abortControllerRef.current = new AbortController();

      try {
        setLoading(true);

        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        const items: ImageItem[] = Array.isArray(data?.media) ? data.media : [];

        if (isMounted.current) {
          setImages(items);
          setImageErrors(new Set());
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        console.error("Outlet image fetch error:", error);
        if (isMounted.current) setImages([]);
      } finally {
        if (isMounted.current) setLoading(false);
      }
    }, [endpoint]);

    useEffect(() => {
      isMounted.current = true;
      fetchOutletImages();

      return () => {
        isMounted.current = false;
        if (abortControllerRef.current) abortControllerRef.current.abort();
      };
    }, [fetchOutletImages]);

    // Flip timer — fade out, swap page, fade in
    useEffect(() => {
      if (pages.length <= 1) return;

      const interval = setInterval(() => {
        // Fade Out
        Animated.timing(flipAnim, {
          toValue: 0.5,
          duration: 200,
          useNativeDriver: true,
        }).start(() =>{
          // Swap page at the invisible midpoint
          setCurrentPage(prev => (prev + 1) % pages.length);
      
        // Fade In
        Animated.timing(flipAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start();
      });
      }, FLIP_INTERVAL);

      return () => clearInterval(interval);
    }, [pages.length, flipAnim]);

    const handleImageError = useCallback((imageId: string) => {
      setImageErrors((prev) => {
        const next = new Set(prev);
        next.add(imageId);
        return next;
      });
    }, []);

    const opacity = flipAnim.interpolate({
      inputRange: [0, 0.5,],
      outputRange: [1, 0],
    });

    const scale = flipAnim.interpolate({
      inputRange: [0, 0.5],
      outputRange: [1, 0.92],
    });

    if (loading) return <Text>Loading Images...</Text>;
    if (images.length === 0) return <Text>No images available.</Text>;

    const currentItems = pages[currentPage] || [];

    return (
      <View style={styles.container}>
        <View style={styles.cardFrame}>
          <Animated.View
            style={[
              styles.pageContainer,
              { opacity, transform: [{ scale }] }
            ]}
          >
            {currentItems.map((item, i) => {
              const imageId = item.id || item.outlet_id || `image-${i}`;
              const uri = item.image;
              const hasError = imageErrors.has(imageId);

              return (
                <View
                  key={imageId}
                  style={{ alignItems: "center", marginHorizontal: 8 }}
                >
                  <Animated.View style={[styles.imageWrapper, {
                    shadowOpacity: flipAnim.interpolate({
                      inputRange: [0, 0.5],
                      outputRange: [0.2, 0],
                    }),
                    backgroundColor: flipAnim.interpolate({
                      inputRange: [0, 0.5],
                      outputRange: ["#ffffff", "transparent"],
                    }),
                  }]}>
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
                      <View style={[styles.image, { justifyContent: "center", alignItems: "center", backgroundColor: "#f0f0f0" }]}>
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

OutletDisplayComponent.displayName = "OutletDisplayComponent";
export default OutletDisplayComponent;
