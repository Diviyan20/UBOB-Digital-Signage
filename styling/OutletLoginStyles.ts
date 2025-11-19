import { StyleSheet } from "react-native";

export const OutletLoginStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFF",
    justifyContent: "flex-start",
    alignItems: "center",
    paddingHorizontal: 24,
  },

  imageContainer:{
    width: "35%", 
    height: "35%",
    resizeMode: "contain",
  },

  card: {
    width: "90%",
    maxWidth: 400,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 6,
  },

  logo: {
    width: 180,
    height: 80,
    marginBottom: 30,
    resizeMode: "contain",
  },

  label: {
    alignSelf: "flex-start",
    fontSize: 16,
    color: "#333",
    fontWeight: "500",
    marginBottom: 6,
  },

  input: {
    width: "100%",
    borderWidth: 2,
    borderColor: "#FFE24A",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: 16,
    marginBottom: 20,
    color: "#333",
  },

  loginButton: {
    backgroundColor: "#FFE24A",
    borderRadius: 8,
    width: "100%",
    alignItems: "center",
    paddingVertical: 12,
    marginTop: 10,
  },

  loginButtonText: {
    color: "#000",
    fontSize: 16,
    fontWeight: "600",
  },
});
