import { OutletImageStyle } from "@/styling/OutletImageStyle";
import { Image } from "expo-image";
import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Text, View, useWindowDimensions } from "react-native";

interface ImageItem {
  image?: string | null;
}

const SERVER_URL = "http://10.0.2.2:5000";

const OutletDisplayComponent: React.FC<{ endpoint?: string }> = ({
  endpoint = `${SERVER_URL}/outlet_image`,
}) => {
  const { width, height } = useWindowDimensions();
  const styles = OutletImageStyle(width, height);

  const [images, setImages] = useState<ImageItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const scrollX = useRef(new Animated.Value(0)).current;
  const isMounted = useRef(true);

  const ITEM_W = Math.min(220, Math.round(width * 0.22));

  const getImageUrl = (path?: string | null) => {
    if (!path) return null;
    if (path.startsWith("http")) return `${path}?t=${Date.now()}`;
    return `${SERVER_URL}${path}?t=${Date.now()}`;
  };

  const fetchOutletImages = async () => {
    try {
      setLoading(true);
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const items = data.media || [];

      if (items.length === 0) throw new Error("No Images found");
      if (isMounted.current) {
        setImages(items);
      }
    } catch (error) {
      console.error("Image Fetch Error:", error);
      if (isMounted.current && images.length === 0) throw new Error("Error fetching Outlets.")
    } finally {
      if (isMounted.current) setLoading(false);
    }
  };


  useEffect(() => {
    fetchOutletImages();
  }, []);

  useEffect(() => {
    if (images.length === 0) return;

    const totalWidth = images.length * (ITEM_W + 18);
    const duration = totalWidth * 25;

    const loopScroll = () => {
      scrollX.setValue(0);
      Animated.timing(scrollX, {
        toValue: -totalWidth,
        duration,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) loopScroll();
      });
    };

    loopScroll();
    return () => scrollX.stopAnimation();
  }, [images, width]);

  if (loading) {
    return (
      <View>
        <Text>Loading Images....</Text>
      </View>
    );
  }

  if (images.length === 0) {
    return (
      <View>
        <Text>No images available.</Text>
      </View>
    );
  }

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
            {[...images, ...images].map((item, index) => {
              return (
                <View style={styles.itemTile} key={index}>
                  {getImageUrl(item.image) ? (
                    <Image
                      source={{ uri: getImageUrl(item.image)! }}
                      style={styles.image}
                      contentFit="contain"
                    />
                  ) : (
                    <Text style={styles.placeholder}>No Image</Text>
                  )}
                </View>
              );
            })}
          </Animated.View>
        </View>
      </View>
    </View>
  );
};

export default OutletDisplayComponent;
