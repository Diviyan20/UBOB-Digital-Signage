import { Dimensions, StyleSheet } from "react-native";

const { width, height } = Dimensions.get("window");

export const MediaStyles = StyleSheet.create({
  
  card: {
    width: width * 0.5,
    backgroundColor: "#fff",
    borderRadius: 20,
    paddingTop: 0,
    height: height / 1.25,
    padding: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    position:"absolute",
  },

  image: {
    width: "100%",
    height: height * 0.61,
    resizeMode:"contain",
    marginTop: 20,
  },

  placeholderText: {
    textAlign: "center",
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
    textAlign: "center",
  },

  category: {
    fontSize: 13,
    color: "#007AFF",
  },

  description: {
    fontSize: 14,
    color: "#444",
    
    textAlign: "center",
    lineHeight: 16,
  },
});