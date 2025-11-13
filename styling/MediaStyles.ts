import { Platform, StyleSheet } from "react-native";

export const MediaStyles = (width: number, height: number) =>
  StyleSheet.create({
    card: {
      width:
        width > 1200 ? width * 0.45 : width > 800 ? width * 0.65 : width * 0.9,
      height: height * 0.72,
      backgroundColor: "#fff",
      borderRadius: 20,
      padding: width > 800 ? 12 : 6,
      elevation: 8, // Shadow for Android & TV
      // Add a visible border for clarity on TV screens
      borderWidth: Platform.OS === "android" ? 1 : 0,
      borderColor: "rgba(0,0,0,0.1)",
      alignSelf: "center",
      justifyContent: "center",
      alignItems: "center",
    },

    image: {
      width: "80%",
      height: height * 0.5,
      resizeMode: "contain",
      marginTop: 10,
    },

    textContainer: {
      width: "100%",
      alignItems: "center",
      paddingHorizontal: width > 600 ? 16 : 8,
      paddingBottom: 10,
    },

    title: {
      fontSize: width > 1200 ? 26 : width > 600 ? 15 : 16,
      fontWeight: "700",
      color: "#111",
      textAlign: "center",
      marginBottom: 6,
    },

    description: {
      fontSize: width > 1200 ? 18 : width > 600 ? 12 : 13,
      color: "#444",
      textAlign: "center",
      lineHeight: width > 800 ? 10 : 16,
    },

    placeholderText: {
      textAlign: "center",
      color: "#888",
      fontSize: width > 600 ? 12 : 13,
    },
  });
