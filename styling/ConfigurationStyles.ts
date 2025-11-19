import { StyleSheet } from "react-native";

export const ConfigurationStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFF",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
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

  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 30,
    textAlign: "center",
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
    borderColor: "#29B6F6",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: 16,
    marginBottom: 20,
    color: "#333",
  },

  readOnlyInput: {
    backgroundColor: "#F5F5F5",
    color: "#666",
    borderColor: "#DDD",
  },

  loginButton: {
    backgroundColor: "#01579B",
    borderRadius: 8,
    width: "100%",
    alignItems: "center",
    paddingVertical: 12,
    marginTop: 10,
  },

  disabledButton: {
    opacity: 0.6,
  },

  loginButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});