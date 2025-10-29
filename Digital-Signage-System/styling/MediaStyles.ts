import { Dimensions, StyleSheet } from "react-native";

const { width, height } = Dimensions.get("window");

export const MediaStyles = StyleSheet.create({
  
  card: {
    width: '40%', // Reduced from 70%
    maxWidth: 700, // Reduced from 800
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 3, // Reduced from 20
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },

  image: {
    width: "100%",
    height: height * 0.58, // Increased from 0.35 to 0.4
    resizeMode: "contain",
    marginBottom: 5,
  },

  placeholderText: {
    textAlign: "center",
    paddingVertical: 40,
    color: "#888",
    fontSize: 14,
  },

  textContainer: {
    width: "100%",
    alignItems: "center",
  },

  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111",
    marginBottom: 6,
    textAlign: "center",
  },

  category: {
    fontSize: 13,
    color: "#007AFF",
    marginBottom: 4,
  },

  description: {
    fontSize: 14,
    color: "#444",
    marginBottom: 2,
    textAlign: "center",
    lineHeight: 15,
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