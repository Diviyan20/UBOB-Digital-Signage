import { fetchPlaylist, PlaylistItems } from "@/services/MediaService";
import { PlaylistStyles as styles } from "@/styling/MediaStyles";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    Animated,
    AppState,
    AppStateStatus,
    Easing,
    Text,
    View,
} from "react-native";
import { config } from "../api/client";

// Separate types for the two lists
interface VideoEntry { url: string; }
interface ImageEntry { url: string; }

type PlaybackMode = "loading" | "video" | "image" | "empty";
type OrientationType = "Landscape" | "Portrait";

export const PlaylistComponent: React.FC = () => {
    const [mode, setMode] = useState<PlaybackMode>("loading");
    const [videos, setVideos] = useState<VideoEntry[]>([]);
    const [images, setImages] = useState<ImageEntry[]>([]);
    const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    
    const [displayDuration, setDisplayDuration] = useState(5000);
    const [fadeDuration, setFadeDuration] = useState(400);
    const [orientation, setOrientation] = useState<OrientationType>("Landscape");

    const fadeAnim = useRef(new Animated.Value(1)).current;
    const isMounted = useRef(true);
    const appStateRef = useRef(AppState.currentState);

    // Ref so useEffect can read latest videos without being a dependency
    const videosRef = useRef<VideoEntry[]>([]);
    const imagesRef = useRef<ImageEntry[]>([]);

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

    const loadPlaylist = useCallback(async () =>{
        const playlist: PlaylistItems[] = await fetchPlaylist();

        // Separate the combined playlist into 2 lists by type
        const fetchedVideos = playlist
        .filter(item => item.type === "video")
        .map(item => ({ url: item.url }));

        const fetchedImages = playlist
            .filter(item => item.type === "image")
            .map(item => ({ url: item.url }));
        
        return { fetchedVideos, fetchedImages };
    }, []);

    const initialize = useCallback(async () => {
        if (!isMounted.current) return;
        setMode("loading");

        // Read orientation from AsyncStorage — determines card style and S3 folder
        const savedOrientation = await AsyncStorage.getItem("orientation");
        if (savedOrientation === "Portrait" || savedOrientation === "Landscape") {
            setOrientation(savedOrientation);
        }
        
        await fetchConfig();
        const { fetchedVideos, fetchedImages } = await loadPlaylist();

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
        } else {
            setMode("empty");
        }
    }, [fetchConfig, loadPlaylist, fadeAnim]);

    // Mount + Resume from background
    useEffect(() => {
        isMounted.current = true;
        initialize();

        const subscription = AppState.addEventListener("change", (nextState: AppStateStatus) => {
                if (appStateRef.current.match(/inactive|background/) && nextState === "active") 
                    {
                        initialize(); // Re-fetch when app comes back to foreground
                    }
                appStateRef.current = nextState;
            });

        return () => {
            isMounted.current = false;
            subscription.remove();
        };
    }, [initialize]);

    // Single place that loads videos into the player — replaceAsync avoids main thread freeze
    useEffect(() => {
        if (mode !== "video" || videosRef.current.length === 0) return;

        const url = videosRef.current[currentVideoIndex]?.url;
        if (!url) return;

        const load = async () => {
            try {
                await player.replaceAsync(url);
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
                setCurrentVideoIndex(nextIndex); // More videos — play next
            } else {
                // All videos done — switch to images (or restart videos if no images)
                setCurrentVideoIndex(0);
                setMode(imagesRef.current.length > 0 ? "image" : "video");
            }
        });

        return () => subscription.remove();
    }, [player, currentVideoIndex, mode]);

    // Image cycling
    useEffect(() => {
        if (mode !== "image" || imagesRef.current.length === 0) return;
        fadeAnim.setValue(1); // Start fully visible

        const timer = setTimeout(() => {
            // Fade Out
            Animated.timing(fadeAnim, {
                toValue: 0,
                duration: fadeDuration,
                easing: Easing.linear,
                useNativeDriver: true,
            }).start(() => {
                if (!isMounted.current) return;

                const nextIndex = currentImageIndex + 1;
                if (nextIndex >= imagesRef.current.length) {
                    // All images shown — switch to videos (or restart images if no videos)
                    setCurrentImageIndex(0);
                    setMode(videosRef.current.length > 0 ? "video" : "image");
                } else {
                    // Advance to next image and fade in
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
            return <Text style={styles.statusText}>Loading media...</Text>;
        }

        if (mode === "empty") {
            return <Text style={styles.statusText}>No media available.</Text>;
        }

        if (mode === "video") {
            return (
                <VideoView
                    player={player}
                    style={styles.media}
                    contentFit="contain"
                    nativeControls={false}
                />
            );
        }

        if (mode === "image") {
            return (
                <Animated.View style={[styles.media, { opacity: fadeAnim }]}>
                    <Image
                        source={{ uri: images[currentImageIndex]?.url }}
                        style={styles.media}
                        contentFit="contain"
                        cachePolicy="memory-disk"
                        recyclingKey={`image-${currentImageIndex}`}
                    />
                </Animated.View>
            );
        }

        return null;
    };

    // Card style switches based on orientation read from AsyncStorage
    const cardStyle = orientation === "Portrait"
        ? styles.portraitCard
        : styles.landscapeCard;

    return (
        <View style={styles.screen}>
            <View style={cardStyle}>
                {renderMedia()}
            </View>
        </View>
    );
};
