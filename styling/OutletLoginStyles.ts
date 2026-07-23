import { StyleSheet } from "react-native";

export const OutletLoginStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFF",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },

  imageContainer: {
    width: 160,
    height: 150,
    resizeMode: "contain",
  },

  card: {
    width: "90%",
    maxWidth: 500,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 6,
  },

  logo: {
    width: "100%",
    height: "100%",
    marginBottom: 10,
    resizeMode: "contain",
  },

  label: {
    alignSelf: "flex-start",
    fontSize: 12,
    color: "#333",
    fontWeight: "500",
    marginBottom: 2,
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
    paddingVertical: 8,
    marginTop: 6,
  },

  adminButton: {
    backgroundColor: "#01579B",
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

  adminButtonText: {
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
  },

  toggleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 6,
    width: "100%",
  },

  toggleButton: {
    minWidth: 100,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ccc",
    alignItems: "center",
    justifyContent: "center",
  },

  toggleButtonActive: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },

  toggleText: {
    color: "#555",
    fontSize: 13,
    fontWeight: "500",
  },

  toggleTextActive: {
    color: "#fff",
  },

  focusedButton: {
    borderColor: "#FFD700",
    borderWidth: 3,
    transform: [{ scale: 1.03 }],
  },

  focusedInputContainer: {
    width: "100%",
    borderRadius: 10,
    borderWidth: 3,
    borderColor: "#FFD700",
  },

  disabledButton: {
    backgroundColor: "#555",
    opacity: 0.5,
  },

  disabledText: {
    color: "#999",
  },

  dropdownContainer: {
    width: "100%",
    marginBottom: 8,
    zIndex: 10, // ensures dropdown list sits above elements below it
  },

  dropdownTrigger: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: "#fff",
  },

  dropdownTriggerOpen: {
    borderColor: "#2563EB",
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },

  dropdownTriggerText: {
    fontSize: 14,
    color: "#333",
    fontWeight: "500",
  },

  dropdownArrow: {
    fontSize: 11,
    color: "#666",
  },

  dropdownList: {
    width: "100%",
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: "#2563EB",
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    backgroundColor: "#fff",
    overflow: "hidden",
  },

  dropdownOption: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
  },

  dropdownOptionActive: {
    backgroundColor: "#EFF6FF",
  },

  dropdownOptionText: {
    fontSize: 14,
    color: "#333",
  },

  dropdownOptionTextActive: {
    color: "#2563EB",
    fontWeight: "600",
  },

  dropdownOptionFocused: {
    backgroundColor: "#1E3A8A", // dark blue background on focus
  },

  dropdownOptionTextFocused: {
    color: "#ffffff", // white text so it's readable on dark blue
    fontWeight: "600",
  },

  // ── Portrait overrides ────────────────────────────────────────────────────────
  // Applied on top of base styles when isPortrait === true.
  // Portrait = tall narrow screen (phone in portrait, portrait TV)
  // ─────────────────────────────────────────────────────────────────────────────

  containerPortrait: {
    paddingHorizontal: 16, // less side padding — screen is narrower
    justifyContent: "flex-start",
    paddingTop: 32,
  },

  imageContainerPortrait: {
    width: 120, // smaller logo — save vertical space
    height: 80,
    marginBottom: 12,
  },

  cardPortrait: {
    width: "96%", // almost full width — narrow screen needs it
    maxWidth: 420,
    paddingVertical: 20,
    paddingHorizontal: 20,
  },

  readOnlyField: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: "#f5f5f5",
    marginBottom: 6,
  },

  readOnlyText: {
    fontSize: 13,
    color: "#888",
    fontWeight: "500",
  },

  loginButtonPortrait: {
    paddingVertical: 14, // larger tap target — finger-friendly on phone
    marginTop: 12,
  },
});
