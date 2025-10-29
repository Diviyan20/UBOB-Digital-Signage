import { OutletImageStyle as styles } from "@/styling/OutletImageStyle";
import React, { useEffect, useState } from "react";
import { Alert, Animated, Dimensions, Easing, Image, Text, View } from "react-native";

interface ImageItem {
  image?: string | null;
}

const OutletDisplayComponent: React.FC<{ endpoint?: string }> = ({
  endpoint = "http://10.0.2.2:5000/outlet_image",
}) => {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const scrollX = new Animated.Value(0);

  const SCREEN_W = Dimensions.get("window").width;
  const ITEM_W = Math.min(220, Math.round(SCREEN_W * 0.22));

  const fetchOutletImages = async () => {
    try {
      setLoading(true);
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      if (data.images && Array.isArray(data.images)) {
        setImages(data.images);
      } else {
        throw new Error("Invalid response format!");
      }
    } catch (error) {
      console.error("Media Fetch Error:", error);
      Alert.alert("Connection Error", "Could not load images.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOutletImages();
  }, []);

  // animation loop for smooth horizontal marquee
  useEffect(() => {
    if (images.length === 0) return;

    const totalWidth = images.length * (ITEM_W + 18);
    const duration = totalWidth * 25;

    const loopScroll = () =>{
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
    
  }, [images]);

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
      const imageUri =
        typeof item.image === "string" && item.image.length > 50
          ? item.image
          : null;

              return(
                <View style={styles.itemTile} key={index}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.image} />
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
