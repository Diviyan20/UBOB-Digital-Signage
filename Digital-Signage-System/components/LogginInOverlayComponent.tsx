import React, { useEffect, useRef } from "react";
import { ActivityIndicator, Animated, Text } from "react-native";

interface LoginOverlayProps {
    visible: boolean;
    status?: "loading" | "success" | "error";
    message?: string;
}

const LoggingInOverlayComponent: React.FC<LoginOverlayProps> = ({
    visible,
    status = "loading",
    message = "Logging in...",
}) => {
    const opacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            Animated.timing(opacity, {
                toValue: 1,
                duration: 300,
                useNativeDriver: true,
            }).start()
        } else {
            Animated.timing(opacity, {
                toValue: 0,
                duration: 300,
                useNativeDriver: true,
            }).start()
        }
    }, [visible]);

    if (!visible) return null;

    const isLoading = status == "loading";
    const isSuccess = status == "success";
    const isError = status == "error";

    return (
        <Animated.View
            style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: "rgba(0,0,0,0.7)",
                justifyContent: "center",
                alignItems: "center",
                zIndex: 1000,
                opacity,
            }}
        >
            {isLoading && <ActivityIndicator size="large" color="#fff" />}
            <Text
                style={{
                    color: "#fff",
                    fontSize: 20,
                    fontWeight: "600",
                    marginTop: 20,
                    textAlign: "center",
                }}
            >
                {isLoading && message}
                {isSuccess && "✅ Success! Redirecting..."}
                {isError && "❌ Invalid Outlet Code"}
            </Text>
        </Animated.View>
    );
};

export default LoggingInOverlayComponent;