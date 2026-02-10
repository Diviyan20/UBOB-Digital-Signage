import { MediaStyles } from "@/styling/MediaStyles";
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Text, useWindowDimensions, View } from "react-native";
import { promotionVideos } from "./Videos";

interface VideoComponentProps {
    onAllVideosFinished: () => void;
}

const VideoComponent: React.FC<VideoComponentProps> = ({ onAllVideosFinished }) => {
    const { width, height } = useWindowDimensions();
    const styles = MediaStyles(width, height);

    const [currentIndex, setCurrentIndex] = useState(0);
    const isMounted = useRef(true);

    const currentVideo = promotionVideos[currentIndex];

    const player = useVideoPlayer(currentVideo?.videoURI, (player) => {
        player.loop = false;
        player.staysActiveInBackground = true;
        player.play();
    });

    const handleVideoEnd = useCallback(() => {
        if (!isMounted.current) return;

        const nextIndex = currentIndex + 1;

        if (nextIndex >= promotionVideos.length) {
            // All videos finished - reset index and notify
            setCurrentIndex(0);
            onAllVideosFinished();
        }
        else {
            // Play next video
            setCurrentIndex(nextIndex);
        }
    }, [currentIndex, onAllVideosFinished]);

    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

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

    return (
        <View style={styles.card}>
          <VideoView
            key={currentIndex}
            player={player}
            style={styles.image}
            contentFit="cover"
            nativeControls={false}
          />
    
          <View style={styles.textContainer}>
            <Text style={styles.title}>{currentVideo.name}</Text>
          </View>
        </View>
      );
    };
    
    export default VideoComponent;