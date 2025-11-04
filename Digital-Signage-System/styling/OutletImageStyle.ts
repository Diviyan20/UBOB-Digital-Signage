import { StyleSheet } from "react-native";

export const OutletImageStyle = (width: number, height: number) => {
  return StyleSheet.create({
    container: {
      width: width,
      height: height * 0.2,
      justifyContent: "flex-start",
      alignItems: "center",
      position: "relative",
      paddingBottom: 20
    },

    cardFrame: {
      width: "100%",
      height: "125%",
      backgroundColor: "#ffffdf",
      overflow: "hidden",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
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

    itemTile: {
      height: "75%",
      aspectRatio: 1.3,
      marginHorizontal: 8,
      borderRadius: 12,
      justifyContent: "flex-start",
      alignItems: "center",
    },

    image: {
      width: "100%",
      height: "100%",
      resizeMode: "contain",
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
