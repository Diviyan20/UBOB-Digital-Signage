import { StyleSheet } from "react-native";


// choose item width relative to screen so it scales on different displays
export 
const CARD_H = 180;

export const OutletImageStyle = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 10,
    width: "100%",
    alignItems: "center",
    justifyContent: "flex-end",
  },

  cardFrame: {
    width: "80%",
    height: CARD_H,
    borderRadius: 20,
    backgroundColor: "#ffff",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 6,
    alignItems: "center",
    justifyContent: "center",
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
  },


  itemTile: {
    height: "85%",
    aspectRatio: 1.3,
    marginRight: 10,
    borderRadius: 16,
    overflow: "hidden",
  },

  image: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
    borderRadius: 14,
  },

  placeholder: {
    fontSize: 16,
    color: "gray",
  },
});
