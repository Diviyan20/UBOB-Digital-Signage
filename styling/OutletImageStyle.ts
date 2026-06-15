import { Platform, StyleSheet } from "react-native";

export const OutletImageStyle = (width: number, height: number) => {
  const imageSize = Math.min(80, width * 0.08); // slightly smaller images to give text room
  const borderRadius = Math.max(12, imageSize * 0.12);

  return StyleSheet.create({
    container: {
      flex: 1,
      width: "100%",
    },

    cardFrame: {
      flex: 1,
      width: "100%",
      backgroundColor: "#FFFFCC",
      elevation: 8,
      borderWidth: Platform.OS === "android" ? 1 : 0,
      borderColor: "rgba(0,0,0,0.1)",
      overflow: "hidden",
      paddingVertical: 8,
    },

    pageContainer: {
      flex: 1,
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center", // centers the whole row of items vertically
      paddingHorizontal: 8,
    },

    imageWrapper: {
      width: imageSize,
      height: imageSize,
      marginHorizontal: 6,
      borderRadius: borderRadius,
      justifyContent: "center",
      alignItems: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      borderWidth: 1,
      borderColor: "rgba(0,0,0,0.5)",
    },

    image: {
      width: "100%",
      height: "100%",
      borderRadius,
    },

    placeholder: {
      fontSize: Math.max(10, width * 0.012),
      color: "#999",
      textAlign: "center",
      textAlignVertical: "center",
      flex: 1,
    },
  });
};