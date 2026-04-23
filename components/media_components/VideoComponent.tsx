import { MediaStyles } from "@/styling/MediaStyles";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Text, useWindowDimensions, View } from "react-native";

export interface VideoItem {
  videoURI: string;
  rotate?: boolean;
}

interface VideoComponentProps {
  videos: VideoItem[];
  onAllVideosFinished: () => void;
}

const sanitizePresignedUrl = (url?: string) =>
  (url || "").trim().replace(/\\+$/g, "").replace(/\s+$/g, "");

const VideoComponent: React.FC<VideoComponentProps> = ({
  videos,
  onAllVideosFinished,
}) => {
  const { width, height } = useWindowDimensions();
  const styles = MediaStyles(width, height);

  const [currentIndex, setCurrentIndex] = useState(0);
  const currentIndexRef = useRef(0);
  const isMounted = useRef(true);

  const currentVideo = videos?.[currentIndex];
  const safeUri = sanitizePresignedUrl(currentVideo?.videoURI);

  useEffect(() => {
    if (!safeUri) return;

    fetch(safeUri, { method: "HEAD" })
      .then((res) => {
        console.log("VIDEO HEAD STATUS:", res.status);
        console.log("HEADERS:", Object.fromEntries(res.headers.entries()));
      })
      .catch((err) => {
        console.error("HEAD REQUEST FAILED:", err);
      });
  }, [safeUri]);

  const player = useVideoPlayer(safeUri, (player) => {
    console.log("Loading video:", safeUri);
    player.loop = false;
    player.staysActiveInBackground = true;

    player.addListener("statusChange", (status) => {
      console.log("PLAYER STATUS:", status);
      if (status.error) {
        console.error("VIDEO ERROR:", status.error);
      }
    });

    player.play();
  });

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  const handleVideoEnd = useCallback(() => {
    if (!isMounted.current || !videos?.length) return;

    const nextIndex = currentIndexRef.current + 1;

    if (nextIndex >= videos.length) {
      setCurrentIndex(0);
      currentIndexRef.current = 0;
      onAllVideosFinished();
    } else {
      setCurrentIndex(nextIndex);
      currentIndexRef.current = nextIndex;
    }
  }, [videos, onAllVideosFinished]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!player) return;

    const subscription = player.addListener("playToEnd", handleVideoEnd);
    return () => subscription.remove();
  }, [player, handleVideoEnd]);

  if (!currentVideo) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text>No videos available</Text>
      </View>
    );
  }

  if (!safeUri) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text>Invalid video URL</Text>
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
            ...styles.portraitVideo,
            transform: [{ rotate: "180deg" }],
          }}
          contentFit="cover"
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
