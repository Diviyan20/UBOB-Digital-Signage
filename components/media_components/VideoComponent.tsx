import { MediaStyles } from "@/styling/MediaStyles";
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Text, useWindowDimensions, View } from "react-native";
import { promotionVideos } from "./Videos";

interface VideoComponentProps {
    videos: typeof promotionVideos
    onAllVideosFinished: () => void;
}

const VideoComponent: React.FC<VideoComponentProps> = ({ videos, onAllVideosFinished }) => {
    const { width, height } = useWindowDimensions();
    const styles = MediaStyles(width, height);

    const [currentIndex, setCurrentIndex] = useState(0);
    const currentIndexRef = useRef(0);
    const isMounted = useRef(true);

    const currentVideo = videos[currentIndex];
    const cardWidth = width > 1200 ? width * 0.25 : width > 800 ? width * 0.35 : width * 0.5;
    const cardHeight = height * 0.80;

    const player = useVideoPlayer(currentVideo?.videoURI, (player) => {
        player.loop = false;
        player.staysActiveInBackground = true;
        player.play();
    });

    // Keep ref in sync with state
    useEffect(() => {
        currentIndexRef.current = currentIndex;
    }, [currentIndex]);

    const handleVideoEnd = useCallback(() => {
        if (!isMounted.current) return;

        const nextIndex = currentIndexRef.current + 1;

        if (nextIndex >= videos.length) {
            // All videos finished - reset index and notify
            setCurrentIndex(0);
            currentIndexRef.current = 0;
            onAllVideosFinished();
        }
        else {
            // Play next video
            setCurrentIndex(nextIndex);
            currentIndexRef.current = nextIndex;
        }
    }, [onAllVideosFinished]);

    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

    // Listener event now only re-runs when player changes, not on every index change
    useEffect(() => {
        const subscription = player.addListener("playToEnd", () => {
            // Video finished playing
            handleVideoEnd();
        });

        return () => {
            subscription.remove();
        };
    }, [player, handleVideoEnd]);

    if (!currentVideo) {
        return (
            <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
                <Text>No videos available</Text>
            </View>
        );
    }

    if (currentVideo.rotate) {
        return (
            <View style={styles.portraitCard}>
                <VideoView
                    key={currentIndex}
                    player={player}
                    style={{
                        position: "absolute",
                        top: "50%",
                        left: "50%",
                        width: cardHeight,
                        height: cardWidth,
                        transform: [
                            { translateX: -cardHeight / 2 },
                            { translateY: -cardWidth / 2 },
                            { rotate: "180deg" },
                        ],
                    }}
                    contentFit="contain"
                    nativeControls={false}
                />
            </View>
        );
    }

    return (
        <View style={styles.card}>
            <VideoView
                key={currentIndex}
                player={player}
                style={styles.image}
                contentFit="contain"
                nativeControls={false}
            />
        </View>
    );
};

export default VideoComponent;