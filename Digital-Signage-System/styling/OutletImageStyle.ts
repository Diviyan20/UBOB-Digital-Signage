import { Dimensions, StyleSheet } from "react-native";

const { width, height } = Dimensions.get("window");

export const OutletImageStyle = StyleSheet.create({
  container: {
    width: width,
    height: "20%",
    justifyContent: "center",
    alignItems: "center"
  },

  cardFrame: {
    width: "100%",
    height: "90%",
    backgroundColor: "#fff",
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
    overflow: "hidden",
  },

  image: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },

  placeholder: {
    fontSize: 16,
    color: "#999",
    textAlign: "center",
    textAlignVertical: "center",
    flex: 1,
  },
});