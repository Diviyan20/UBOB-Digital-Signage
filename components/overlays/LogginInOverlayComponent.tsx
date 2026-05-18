import { LoginOverlayStyle as styles } from "@/styling/OverlayStyles";
import React, { useEffect, useRef } from "react";
import { ActivityIndicator, Animated, Text } from "react-native";

interface LoginOverlayProps {
    visible: boolean;
    status?: "loading" | "fetching_promotions" | "preloading_images" | "success" | "error";
    message?: string;
}
export const LoggingInOverlayComponent: React.FC<LoginOverlayProps> = ({
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

    const isLoading = status === "loading";
    const isFetching = status === "fetching_promotions";
    const isPreloading = status === "preloading_images";
    const isSuccess = status === "success";
    const isError = status === "error";
    const showSpinner = isLoading || isFetching || isPreloading; // Show loading spinner for loading states

    return (
        <Animated.View style= {styles.container}>
            {showSpinner && <ActivityIndicator size="large" color="#fff" />}
            <Text style={styles.statusText}>
                {isLoading && message}
                {isFetching && message}
                {isPreloading && message}
                {isSuccess && "✅ Success! Loading Media..."}
                {isError && "❌ Invalid Outlet Code"}
            </Text>
        </Animated.View>
    );
};