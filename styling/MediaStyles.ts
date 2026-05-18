import { Platform, StyleSheet } from "react-native";

export const ImageStyles = (width: number, height: number) =>
  StyleSheet.create({
    card: {
      width:
        width > 1200 ? width * 0.45 : width > 800 ? width * 0.65 : width * 0.9,
      height: height * 0.72,
      backgroundColor: "#FFFFCC",
      borderRadius: 20,
      padding: width > 800 ? 12 : 6,
      elevation: 8,
      borderWidth: Platform.OS === "android" ? 1 : 0,
      borderColor: "#fff",
      alignSelf: "center",
      justifyContent: "center",
      alignItems: "center",
      overflow: "hidden",
    },

    image: {
      width: "100%",
      flex: 1,
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

export const VideoStyles = (width: number, height: number) =>
  StyleSheet.create({
    card: {
      width:
        width > 1200 ? width * 0.45 : width > 800 ? width * 0.65 : width * 0.9,
      height: height * 0.72,
      backgroundColor: "#FFFFCC",
      borderRadius: 20,
      padding: width > 800 ? 12 : 6,
      elevation: 8,
      borderWidth: Platform.OS === "android" ? 1 : 0,
      borderColor: "#fff",
      alignSelf: "center",
      justifyContent: "center",
      alignItems: "center",
      overflow: "hidden",
    },

    video: {
      width: "100%",
      height: '100%',
    },

    portraitCard: {
      width:
        width > 1200 ? width * 0.35 : width > 800 ? width * 0.5 : width * 0.75,
      height: height * 0.7,
      backgroundColor: "#fff",
      borderRadius: 20,
      padding: 0,
      borderWidth: Platform.OS === "android" ? 1 : 0,
      borderColor: "#fff",
      alignSelf: "center",
      justifyContent: "center",
      alignItems: "center",
      overflow: "hidden",
    },

    portraitVideo: {
      width: "100%",
      height: "100%",
    },
  });

export const MediaScreenStyle = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F2F0EF",
    padding: 10,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: "#666",
  },
  errorText: {
    fontSize: 16,
    color: "#ff4444",
    textAlign: "center",
  },
  topRow: {
    flex: 3,
    flexDirection: "row",
    gap: 10,
  },
  leftColumn: {
    flex: 1,
    borderRadius: 20,
    overflow: "hidden",
  },
  rightColumn: {
    flex: 2,
    borderRadius: 10,
    overflow: "hidden",
  },
  bottomRow: {
    flex: 1,
    marginTop: 10,
    borderRadius: 20,
    overflow: "hidden",
  },
});