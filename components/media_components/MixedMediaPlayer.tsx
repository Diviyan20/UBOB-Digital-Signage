import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    Animated,
    AppState,
    AppStateStatus,
    Easing,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { api, config } from "../api/client";

type PlaybackMode = "loading" | "video" | "image";

interface VideoItem {
    key: string;
    filename: string;
    url: string;
}

interface ImageItem {
    url: string;
    filename?: string;
    key?: string;
}

export const MixedMediaPlayer: React.FC = () => {
    const [mode, setMode] = useState<PlaybackMode>("loading");
    const [videos, setVideos] = useState<VideoItem[]>([]);
    const [images, setImages] = useState<ImageItem[]>([]);
    const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [displayDuration, setDisplayDuration] = useState(5000);
    const [fadeDuration, setFadeDuration] = useState(400);

    const fadeAnim = useRef(new Animated.Value(1)).current;
    const isMounted = useRef(true);
    const appStateRef = useRef(AppState.currentState);

    // Ref so useEffect can read latest videos without being a dependency
    const videosRef = useRef<VideoItem[]>([]);
    const imagesRef = useRef<ImageItem[]>([]);

    const player = useVideoPlayer(null, (p) => {
        p.loop = false;
    });

    const fetchConfig = useCallback(async () => {
        try {
            const response = await fetch(config);
            const data = await response.json();
            setDisplayDuration(data.config.image_display_duration);
            setFadeDuration(data.config.fade_duration);
        } catch {
            // Fallback values already in state
        }
    }, []);

    const fetchMixedMedia = useCallback(async (): Promise<{
        videos: VideoItem[];
        images: ImageItem[];
    }> => {
        try {
            const outletId = await AsyncStorage.getItem("outlet_id");
            const batchNumber = await AsyncStorage.getItem("batch_number");

            const response = await fetch(api.mixedMedia, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    outlet_id: outletId,
                    batch_number: parseInt(batchNumber || "1"),
                }),
            });

            const data = await response.json();
            console.log("Videos: ", data.videos);
            console.log("Images: ", data.images);
            return {
                videos: data.videos || [],
                images: data.images || [],
            };
        } catch (err) {
            console.error("Failed to fetch mixed media:", err);
            return { videos: [], images: [] };
        }
    }, []);

    const initialize = useCallback(async () => {
        if (!isMounted.current) return;
        setMode("loading");

        await fetchConfig();
        const { videos: fetchedVideos, images: fetchedImages } = await fetchMixedMedia();

        if (!isMounted.current) return;

        // Update refs first — the useEffect reads from these synchronously
        videosRef.current = fetchedVideos;
        imagesRef.current = fetchedImages;

        setVideos(fetchedVideos);
        setImages(fetchedImages);
        setCurrentVideoIndex(0);
        setCurrentImageIndex(0);
        fadeAnim.setValue(1);

        // Just set mode — the useEffect below owns all player.replace calls
        if (fetchedVideos.length > 0) {
            setMode("video");
        } else if (fetchedImages.length > 0) {
            setMode("image");
        }
    }, [fetchMixedMedia, fetchConfig, fadeAnim]);

    useEffect(() => {
        isMounted.current = true;
        initialize();

        const subscription = AppState.addEventListener(
            "change",
            (nextState: AppStateStatus) => {
                if (
                    appStateRef.current.match(/inactive|background/) &&
                    nextState === "active"
                ) {
                    initialize();
                }
                appStateRef.current = nextState;
            }
        );

        return () => {
            isMounted.current = false;
            subscription.remove();
        };
    }, [initialize]);

    // Single place that loads videos into the player — replaceAsync avoids main thread freeze
    useEffect(() => {
        if (mode !== "video" || videosRef.current.length === 0) return;

        const load = async () => {
            try {
                await player.replaceAsync(videosRef.current[currentVideoIndex].url);
                player.play();
            } catch (err) {
                console.error("Failed to load video:", err);
            }
        };

        load();
    }, [currentVideoIndex, mode]);

    // Advance to next video on end
    useEffect(() => {
        if (mode !== "video") return;

        const subscription = player.addListener("playToEnd", () => {
            if (!isMounted.current) return;

            const nextIndex = currentVideoIndex + 1;
            if (nextIndex < videosRef.current.length) {
                setCurrentVideoIndex(nextIndex);
            } else {
                setCurrentVideoIndex(0);
                setMode(imagesRef.current.length > 0 ? "image" : "video");
            }
        });

        return () => subscription.remove();
    }, [player, currentVideoIndex, mode]);

    // Image cycling
    useEffect(() => {
        if (mode !== "image" || imagesRef.current.length === 0) return;
        fadeAnim.setValue(1);

        const timer = setTimeout(() => {
            Animated.timing(fadeAnim, {
                toValue: 0,
                duration: fadeDuration,
                easing: Easing.linear,
                useNativeDriver: true,
            }).start(() => {
                if (!isMounted.current) return;

                const nextIndex = currentImageIndex + 1;
                if (nextIndex >= imagesRef.current.length) {
                    setCurrentImageIndex(0);
                    setMode(videosRef.current.length > 0 ? "video" : "image");
                } else {
                    setCurrentImageIndex(nextIndex);
                    Animated.timing(fadeAnim, {
                        toValue: 1,
                        duration: fadeDuration,
                        easing: Easing.linear,
                        useNativeDriver: true,
                    }).start();
                }
            });
        }, displayDuration);

        return () => clearTimeout(timer);
    }, [mode, currentImageIndex, displayDuration, fadeDuration]);

    // ─── Render ───────────────────────────────────────────────────────────────

    const renderMedia = () => {
        if (mode === "loading") {
            return <Text style={styles.loadingText}>Loading media...</Text>;
        }

        if (mode === "video" && videos.length > 0) {
            return (
                <VideoView
                    player={player}
                    style={styles.media}
                    contentFit="contain"
                    nativeControls={false}
                />
            );
        }

        if (mode === "image" && images.length > 0) {
            const current = images[currentImageIndex];
            return (
                <Animated.View style={[styles.media, { opacity: fadeAnim }]}>
                    <Image
                        source={{ uri: current.url || "" }}
                        style={styles.media}
                        contentFit="contain"
                        cachePolicy="memory-disk"
                        recyclingKey={`image-${currentImageIndex}`}
                    />
                </Animated.View>
            );
        }

        return <Text style={styles.loadingText}>No media available.</Text>;
    };

    return (
        <View style={styles.screen}>
            <View style={styles.card}>
                {renderMedia()}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: "#ffffff",
        justifyContent: "center",
        alignItems: "center",
    },
    card: {
        width: "85%",
        aspectRatio: 16 / 9,
        backgroundColor: "#000",
        borderRadius: 20,
        elevation: 12,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.25,
        shadowRadius: 10,
        justifyContent: "center",
        alignItems: "center",
    },
    media: {
        width: "100%",
        height: "100%",
        borderRadius: 20,
    },
    loadingText: {
        color: "#ffffff",
        fontSize: 18,
    },
});