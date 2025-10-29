import { Dimensions, StyleSheet } from "react-native";

const { width } = Dimensions.get("window");
const isLargeScreen = width > 1000;

// Flexible columns — 4 per row on large screens, 2 per row on smaller
const cardWidth = isLargeScreen ? Math.min(900, width * 0.6) : width * 0.92;

const imageHeight = Math.min(800, cardWidth * 0.66);

export const MediaStyles = StyleSheet.create({
  
container :{
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 10,
    backgroundColor: "#fff",
},

  card: {
    width: cardWidth,
    maxWidth: "40%",
    alignSelf: "center",
    backgroundColor: "#fff",
    borderRadius: 16,
    margin: 12,
    paddingBottom: 12,
    overflow: "hidden",
    alignItems: "stretch",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },

  image: {
    width: "100%",
    height: imageHeight,
    resizeMode: "contain",
    backgroundColor: "#f2f2f2",
  },

  placeholderText: {
    textAlign: "center",
    paddingVertical: 40,
    color: "#888",
    fontSize: 14,
  },

  textContainer: {
    width: "100%",
    padding: 10,
  },

  title: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111",
    marginBottom: 4,
  },

  category: {
    fontSize: 12,
    color: "#007AFF",
    marginBottom: 6,
  },

  description: {
    fontSize: 13,
    color: "#444",
    marginBottom: 6,
  },

  date: {
    fontSize: 13,
    color: "#777",
  },

  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    fontSize: 16,
    color: "#777",
  },
});
