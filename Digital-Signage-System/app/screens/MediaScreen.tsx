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
      <View style ={styles.outletSpacing}></View>
      <OutletDisplayComponent/>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 20,
    paddingBottom: 30,
  },
  promoSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  outletSpacing: {
    height: 110,
  },
});

export default MediaScreen;