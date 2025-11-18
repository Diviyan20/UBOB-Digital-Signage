import { OutletImageStyle } from "@/styling/OutletImageStyle";
import { Image } from "expo-image";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, Text, View, useWindowDimensions } from "react-native";

interface ImageItem {
  id?: string;
  image?: string | null;
  outlet_name?: string;
  outlet_id?: string;
}

const SERVER_URL = "https://ubob-digital-signage.onrender.com";
const PREFETCH_BUFFER = 5 // Prefetch 5 images for marquee effect

const OutletDisplayComponent: React.FC<{ endpoint?: string }> = React.memo(({
  endpoint = `${SERVER_URL}/outlet_image_combined`,
}) => {
  const { width, height } = useWindowDimensions();
  const styles = OutletImageStyle(width, height);

  const [images, setImages] = useState<ImageItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());
  
  const scrollX = useRef(new Animated.Value(0)).current;
  const isMounted = useRef(true);
  const abortControllerRef = useRef<AbortController |null>(null);
  const prefetchCache = useRef<Set<string>>(new Set());
  const ITEM_W = Math.min(220, Math.round(width * 0.22));

  // Helper to form valid image URL (without cache-busting for better caching)
  const getImageUrl = useCallback((path?: string | null, bustCache = false) => {
    if (!path) return null;
    if (path.startsWith("http")) {
      return bustCache ? `${path}?t=${Date.now()}` : path;
    }
    return bustCache 
      ? `${SERVER_URL}${path}?t=${Date.now()}` 
      : `${SERVER_URL}${path}`;
  }, []);

  // Smart prefetching for marquee (Prefetch images that will be visible soon)
  const smartPrefetchForMarquee = useCallback(()=>{
    if (images.length === 0) return;

    const urlsToPrefetch: string[] = [];

    // For marquee, prefetch more images since scrolling is continuous
    for (let i =0; i < Math.min(PREFETCH_BUFFER, images.length); i++){
      const url = getImageUrl(images[i]?.image);
      if (url && !prefetchCache.current.has(url)){
        urlsToPrefetch.push(url);
        prefetchCache.current.add(url);
      }
    }

    if (urlsToPrefetch.length > 0){
      const prefetchPromises = urlsToPrefetch.map(url =>
        Image.prefetch(url).catch(() => null)
      );

      Promise.all(prefetchPromises).then(() =>{
        console.log(`✅ Prefetched ${urlsToPrefetch.length} marquee images`);
      });
    }

  }, [images, getImageUrl]);


  const fetchOutletImages = useCallback(async () => {
    // Cancel any ongoing request
    if (abortControllerRef.current){
      abortControllerRef.current.abort()
    }
    
    // Create a new abort controller for this request
    abortControllerRef.current = new AbortController();
    
    try {
      setLoading(true);
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const items = data.media || [];

      if (items.length === 0) throw new Error("No Images found");
      
      if (isMounted.current) {
        setImages(items);
        setImageErrors(new Set()); // Reset errors when fetching new images
        prefetchCache.current.clear(); // Clear the current cache 
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      console.error("Image Fetch Error:", error);
      
      if (isMounted.current && images.length === 0) console.error("Error fetching Outlets:", error);
        
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, [endpoint, images.length]);

  // Initial prefetch when images load
  useEffect(() =>{
    if (images.length > 0){
      smartPrefetchForMarquee();
    }
  }, [images, smartPrefetchForMarquee]);

  // Component mount/unmount cleanup
  useEffect(() => {
    isMounted.current = true;
    fetchOutletImages(); // Fetch initial data

    return () => {
      isMounted.current = false;
      scrollX.stopAnimation();

      // Cancel any ongoing requests
      if (abortControllerRef.current){
        abortControllerRef.current.abort();
      }
    };
  }, [fetchOutletImages]);


  // Marquee animation (All images are still rendered for smooth scrolling)
  useEffect(() => {
    if (images.length === 0) return;

    const itemWidth = ITEM_W + 8;
    const originalWidth = images.length * itemWidth;
    const duration = originalWidth * 25;

    const startInfiniteScroll = () => {
      scrollX.setValue(0);
      const animate = () =>{
        Animated.timing(scrollX, {
          toValue: -originalWidth,
          duration,
          easing: Easing.linear,
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished && isMounted.current){
            // Instantly reset position without visual jump (Seamless transition)
            scrollX.setValue(0);
            smartPrefetchForMarquee();
            animate();
          }
        });
      };
      animate();  
    };

    startInfiniteScroll();
    return () => scrollX.stopAnimation();
  }, [images.length, ITEM_W, width, smartPrefetchForMarquee]);

  const handleImageError = useCallback((imageId: string) => {
    setImageErrors(prev => new Set(prev).add(imageId));
  }, []);

  if (loading) return <Text>Loading Images....</Text>;

  if (images.length === 0) return <Text>No images available.</Text>;

  // All images still rendered here for marquee effect
  const duplicatedImages = [...images, ...images];

  return (
    <View style={styles.container}>
      <View style={styles.cardFrame}>
        <View style={styles.marqueeWrapper}>
          <Animated.View
            style={[
              styles.marqueeInner,
              { transform: [{ translateX: scrollX }] },
            ]}
          >
            {duplicatedImages.map((item, i) => {
              const imageId = item.id || item.outlet_id || `image-${i}`;
              const uri = getImageUrl(item.image);
              const hasError = imageErrors.has(imageId);
              
              return (
                <View key={`${imageId}-${i}`} style={{ alignItems: "center", marginHorizontal: 8 }}>
                  <View style={styles.imageWrapper}>
                    {uri && !hasError ? (
                      <Image
                        source={{ uri }}
                        style={styles.image}
                        contentFit="cover"
                        transition={200}
                        cachePolicy="memory-disk"
                        recyclingKey={imageId}
                        onError={(error) => {
                          console.warn(`Image load error for ${item.outlet_name} (${imageId}):`, error);
                          handleImageError(imageId);
                        }}
                        onLoadStart={() => {
                          // Remove from errors if it starts loading successfully
                          if (imageErrors.has(imageId)) {
                            setImageErrors(prev => {
                              const next = new Set(prev);
                              next.delete(imageId);
                              return next;
                            });
                          }
                        }}
                        
                      />
                    ) : (
                      <View style={[styles.image, { justifyContent: "center", alignItems: "center", backgroundColor: "#f0f0f0" }]}>
                        <Text style={styles.placeholder}>No Image</Text>
                      </View>
                    )}
                  </View>
                  <Text
                    style={{
                      textAlign: "center",
                      marginTop: 6,
                      fontSize: 11,
                      fontWeight: "bold",
                      color: "#333",
                      flexWrap: "wrap",
                      width: Math.min(85, width * 0.15),
                      lineHeight: 10,
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
    </View>
  );
});

export default OutletDisplayComponent;
