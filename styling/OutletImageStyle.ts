import { Platform, StyleSheet } from "react-native";

export const OutletImageStyle = (width: number, height: number) => {
  const imageSize = Math.min(90, width * 0.2); // responsive image size
  const borderWidth = Math.max(2, imageSize * 0.02); // white border scales
  const borderRadius = Math.max(12, imageSize * 0.12); // rounded edges

  return StyleSheet.create({
    container: {
      width: width,
      height: height * 0.23,
      justifyContent: "center",
      alignItems: "center",
      position: "relative",
      paddingBottom: 10,
    },

    cardFrame: {
      width: "100%",
      height: "125%",
      backgroundColor: "#fff",
      elevation: 8,
      borderWidth: Platform.OS === "android" ? 1 : 0,
      borderColor: "rgba(0,0,0,0.1)",
      overflow: "hidden",
      justifyContent: "center",
      alignItems: "center",
    },

    marqueeWrapper: {
      width: "100%",
      height: "100%",
      overflow: "hidden",
    },

    marqueeInner: {
      flexDirection: "row",
      alignItems: "center",
      height: "100%",
      paddingHorizontal: 12,
    },

    imageWrapper: {
      width: imageSize,
      height: imageSize,
      marginHorizontal: 8,
      marginTop: 8,
      borderRadius: borderRadius + borderWidth,
      backgroundColor: "#fff",
      justifyContent: "center",
      alignItems: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      elevation: 6,
    },

    image: {
      width: "100%",
      height: "100%",
      borderRadius,
      resizeMode: "cover",
    },

    placeholder: {
      fontSize: Math.max(12, width * 0.015),
      color: "#999",
      textAlign: "center",
      textAlignVertical: "center",
      flex: 1,
    },
  });
};
