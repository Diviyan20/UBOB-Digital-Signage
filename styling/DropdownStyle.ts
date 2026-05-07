import { StyleSheet } from "react-native";

export const dropdownStyles = StyleSheet.create({
    container: {
      width: "100%",
      zIndex: 10,
    },
  
    inputRow: {
      flexDirection: "row",
      alignItems: "center",
    },
    input: {
      flex: 1,
      borderWidth: 1,
      borderColor: "#ccc",
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      color: "#333",
      backgroundColor: "#fff",
    },
    spinner: {
      marginLeft: 8,
    },
    dropdown: {
      position: "absolute",
      top: 72,
      left: 0,
      right: 0,
      backgroundColor: "#fff",
      borderWidth: 1,
      borderColor: "#ccc",
      borderRadius: 8,
      maxHeight: 200,
      zIndex: 20,
      elevation: 6,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
    },
    dropdownItem: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: "#f0f0f0",
      flexDirection: "row",
      gap: 12,
      alignItems: "center",
    },
    dropdownItemPressed: {
      backgroundColor: "#f5f5f5",
    },
  
    dropdownItemFocused: {
      backgroundColor: "#1F4E79",
      borderLeftWidth: 4,
      borderLeftColor: "#2E75B6",
    },
    focusedText: {
      color: "#ffffff",
    },
  
    outletId: {
      fontSize: 13,
      fontWeight: "700",
      color: "#333",
      width: 40,
    },
    outletName: {
      fontSize: 13,
      color: "#333",
      flex: 1,
    },
    outletRegion: {
      fontSize: 12,
      color: "#888",
    },
  });