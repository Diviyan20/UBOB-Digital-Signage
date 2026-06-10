import { StyleSheet } from "react-native";

export const ErrorOverlayStyle = StyleSheet.create({
    outletContainer: {
        backgroundColor: "#FFF3CD", // soft warning yellow
        borderRadius: 12,
        padding: 20,
        margin: 16,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: "#FFEEBA", // slightly darker yellow border
        shadowColor: "#000",
        shadowOpacity: 0.1,
        shadowOffset: { width: 0, height: 3 },
        shadowRadius: 4,
        elevation: 3,
      },
      outletButton: {
        backgroundColor: "#DC3545", // bright red
        borderRadius: 8,
        paddingVertical: 10,
        paddingHorizontal: 24,
      },


      outletButtonText: {
        color: "#FFF",
        fontSize: 16,
        fontWeight: "700",
        textAlign: "center",
      },
    
    outletTextPrimary: {
        color: "#000",
        fontSize: 20,
        fontWeight: "700",
        textAlign: "center",
        marginBottom: 8,
    },
    outletTextSecondary: {
        color: "#000",
        fontSize: 16,
        textAlign: "center",
        marginBottom: 16,
    },

    mediaContainer :{
        backgroundColor: "#0F52BA", // Sapphire Blue
        borderRadius: 12,
        padding: 20,
        margin: 16,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: "#FFEEBA", // slightly darker yellow border
        shadowColor: "#000",
        shadowOpacity: 0.1,
        shadowOffset: { width: 0, height: 3 },
        shadowRadius: 4,
        elevation: 3,
    },
    mediaButton:{
        backgroundColor: "#000", // Black
        borderRadius: 8,
        paddingVertical: 10,
        paddingHorizontal: 24,
    },
    mediaButtonText:{
        color: "#FFF",
        fontSize: 16,
        fontWeight: "700",
        textAlign: "center",
    },
    mediaTextPrimary:{
        color: "#fff",
        fontSize: 20,
        fontWeight: "700",
        textAlign: "center",
        marginBottom: 8,
    },
    mediaTextSecondary:{
        color: "#fff",
        fontSize: 16,
        textAlign: "center",
        marginBottom: 16,
    },
    });

export const LoginOverlayStyle = StyleSheet.create({
    container:{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.7)",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 1000,
    },
    statusText:{
        color: "#fff",
        fontSize: 20,
        fontWeight: "600",
        marginTop: 20,
        textAlign: "center",
    }
})


export const watchDogOverlayStyle = StyleSheet.create({
    errorOverlay: {
        ...StyleSheet.absoluteFillObject, // sits on top of everything
        backgroundColor: "rgba(0,0,0,0.65)",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 999,
    },
    errorCard: {
        backgroundColor: "#fff",
        borderRadius: 16,
        padding: 32,
        maxWidth: 420,
        alignItems: "center",
        elevation: 10,
    },
    errorTitle: {
        fontSize: 20,
        fontWeight: "700",
        color: "#B91C1C",
        marginBottom: 12,
        textAlign: "center",
    },
    errorMessage: {
        fontSize: 15,
        color: "#333",
        textAlign: "center",
        lineHeight: 24,
        marginBottom: 12,
    },
    errorSub: {
        fontSize: 13,
        color: "#888",
        textAlign: "center",
    },
})