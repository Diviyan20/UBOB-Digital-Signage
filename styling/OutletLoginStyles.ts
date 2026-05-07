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

  adminButton:{
    backgroundColor:"#01579B",
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

  adminButtonText:{
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },

  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  
  popupCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 28,
    width: 360,
    alignItems: "center",
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
  },

  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1F4E79",
    marginBottom: 8,
  },

  message: {
    fontSize: 15,
    color: "#555",
    marginBottom: 12,
    textAlign: "center",
  },

  outletInfo: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 24,
    textAlign: "center",
  },

  buttonRow: {
    flexDirection: "row",
    gap: 16,
  },

  button: {
    paddingVertical: 12,
    paddingHorizontal: 36,
    borderRadius: 10,
  },

  yesButton: {
    backgroundColor: "#1F4E79",
  },

  noButton: {
    backgroundColor: "#f0f0f0",
  },

  yesButtonFocused: {
    backgroundColor: "#163a5f",
    borderWidth: 2,
    borderColor: "#2E75B6",
  },

  noButtonFocused: {
    backgroundColor: "#dcdcdc",
    borderWidth: 2,
    borderColor: "#999",
  },

  yesText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
  noText: {
    color: "#333",
    fontWeight: "600",
    fontSize: 15,
  }
  
});
