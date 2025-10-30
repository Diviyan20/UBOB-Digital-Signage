import ImageComponent from "@/components/ImageComponent";
import OutletDisplayComponent from "@/components/OutletImageComponent";
import React from "react";
import { Dimensions, StyleSheet, View } from "react-native";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const MediaScreen = () => {
  
  return (
    <View style={styles.container}>
      {/* Top section - Promo card */}
      <View style={styles.promoSection}>
        <ImageComponent />
      </View>  
    <OutletDisplayComponent />
  </View>
    
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  promoSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default MediaScreen;