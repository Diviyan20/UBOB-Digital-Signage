import { Platform, StyleSheet } from "react-native";

export const ImageStyles = (width: number, height: number) =>
  StyleSheet.create({
    card: {
      flex: 1,
      width:
        width > 1200 ? width * 0.45 : width > 800 ? width * 0.65 : width * 0.9,
      height: height * 0.62,
      backgroundColor: "#FFFFCC",
      borderRadius: 20,
      elevation: 8,
      padding: width > 800 ? 12 : 6,
      borderWidth: Platform.OS === "android" ? 1 : 0,
      borderColor: "#fff",
      alignSelf: "center",
      justifyContent: "flex-start",
      alignItems: "center",
      overflow: "hidden",
    },

    image: {
      width: "100%",
      height: height * 0.50,
    },

    textContainer: {
      width: "50%",
      alignItems: "center",
      paddingHorizontal: width > 600 ? 16 : 8,
      paddingTop: 20,
      paddingBottom: 10,
    },

    title: {
      fontSize: width > 1200 ? 26 : width > 600 ? 15 : 16,
      fontWeight: "700",
      color: "#111",
      textAlign: "center",
      marginBottom: 6,
    },

    placeholderText: {
      textAlign: "center",
      color: "#888",
      fontSize: width > 600 ? 12 : 13,
    },
  });

export const VideoStyles = (width: number, height: number) =>
  StyleSheet.create({

    /*
    =====================================
    LANDSCAPE VIDEO CARD
    =====================================
    */
    landscapeCard: {
      flex: 1,
      width:"100%",
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
      overflow: "hidden"
    },

    /*
    =====================================
    VIDEO WRAPPER
    Prevents clipping issues
    =====================================
    */

    videoContainer: {
      width: "100%",
      height: "100%",
      justifyContent: "center",
      alignItems: "center",
      overflow: "hidden",
    },

    /*
    =====================================
    LANDSCAPE VIDEO
    =====================================
    */

    video: {
      width: "100%",
      height: '100%',
    },

    /*
    =====================================
    PORTRAIT VIDEO CARD
    =====================================
    */

    portraitCard: {
      flex: 1,
      width: "100%",
      backgroundColor: "#fff",
      borderRadius: 20,
      padding: 0,
      borderWidth: Platform.OS === "android" ? 1 : 0,
      borderColor: "#fff",
      alignSelf: "stretch",
      justifyContent: "center",
      alignItems: "center",
      overflow: "hidden",
    },

    /*
    =====================================
    PORTRAIT VIDEO
    =====================================
    */

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
    flex: 1.9,
    flexDirection: "row",
    gap: 10,
  },

  leftColumn: {
    flex: 1.2,
    borderRadius: 20,
    overflow: "hidden",
  },

  rightColumn: {
    flex: 1.8,
    borderRadius: 10,
    overflow: "hidden",
  },

  bottomRow: {
    flex: 0.65,
    marginTop: 20,
    borderRadius: 20,
    overflow: "hidden",
  },

  badgeContainer: {
    position: "absolute",
    bottom: 17,
    right: 16,
    zIndex: 99,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#6E6E6E",
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 20,
  },

  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8
  },

  badgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
  },
});

export const VideoScreenStyle = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f0f0f0",
  },
})

export const PlaylistStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f0f0f0"
  },

  landscapeCard: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#FFFFCC",
    overflow: "hidden",
    elevation: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },

  portraitCard: {
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },

  media: {
    width: "100%",
    height: "100%",
  },
  statusText: {
    color: "#000",
    fontSize: 16,
  },
});