import { StyleSheet } from "react-native";

export const MediaStyles = (width: number, height: number) =>
  StyleSheet.create({
    card: {
      width: width > 1200 ? width * 0.45 : width > 800 ? width * 0.65 : width * 0.9,
      height: height * 0.75,
      backgroundColor: "#fff",
      borderRadius: 20,
      padding: width > 800 ? 12 : 6,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 6,
      alignSelf: "center",
    },

    image: {
      width: "100%",
      height: height * 0.5,
      resizeMode: "contain",
      marginTop: 10,
    },

    textContainer: {
      width: "100%",
      alignItems: "center",
      paddingHorizontal: width > 800 ? 16 : 8,
      paddingBottom: 10,
    },

    title: {
      fontSize: width > 1200 ? 26 : width > 800 ? 20 : 16,
      fontWeight: "700",
      color: "#111",
      textAlign: "center",
      marginBottom: 6,
    },

    description: {
      fontSize: width > 1200 ? 18 : width > 800 ? 15 : 13,
      color: "#444",
      textAlign: "center",
      lineHeight: width > 800 ? 20 : 16,
    },

    placeholderText: {
      textAlign: "center",
      color: "#888",
      fontSize: width > 800 ? 16 : 13,
    },
  });
