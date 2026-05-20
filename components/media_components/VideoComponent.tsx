import { fetchVideos, VideoItem } from "@/services/MediaService";
import { VideoStyles } from "@/styling/MediaStyles";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Text, useWindowDimensions, View } from "react-native";

interface Props {
  onAllVideosFinished: () => void;
}

export const VideoComponent = ({
  onAllVideosFinished,
}: Props) => {

  const { width, height } = useWindowDimensions();
  const styles = VideoStyles(width, height);

  const [videos, setVideos] = useState<VideoItem[]>([]); // All fetched videos
  const [currentIndex, setCurrentIndex] = useState(0); // Current playing video index

  // Ref so effects always read the latest list without stale closures
  const videosRef = useRef<VideoItem[]>([]);
  const isMounted = useRef(true);

  const currentVideo = videos[currentIndex]; //Current video object

  /**
    * Video player
   */
  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
  });

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false };
  }, []);

  /**
   * Fetch videos on mount
  */
  useEffect(() => {
    const loadVideos = async () => {
      const fetchedVideos = await fetchVideos();
      console.log("Fetched before slice:", fetchedVideos.length);

      if (!isMounted.current) return;

      const shuffled = [...fetchedVideos].sort(() => Math.random() - 0.5); // Shuffle videos randomly

      const selectedVideos = shuffled.slice(0, 2); // Take only 2 videos

      videosRef.current = selectedVideos;
      setVideos(selectedVideos);
    };

    loadVideos();
  }, []);

  /**
 * Load current video into player when videos load or index changes
 */
  useEffect(() => {
    if (videosRef.current.length === 0) return;

    const url = videosRef.current[currentIndex]?.videoURI;
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
  }, [currentIndex, videos]); // fires when videos first load, and on every index change

  /**
   * Move to next video
   */
  const playNextVideo = useCallback(() => {
    if (!isMounted.current) return;

    const nextIndex = currentIndex + 1;
    /**
      * Playlist finished
    */
    if (nextIndex >= videosRef.current.length) {
      onAllVideosFinished();
      return;
    }

    setCurrentIndex(nextIndex);

  }, [currentIndex, videos, onAllVideosFinished]);

  /**
   * Listen for video completion
   */
  useEffect(() => {
    if (!player) return;

    const subscription = player.addListener("playToEnd", playNextVideo);

    return () => { subscription.remove() };
  }, [player, playNextVideo]);

  /*
    * Listen for playback errors
  */
  useEffect(() => {
    const subscription = player.addListener("statusChange", (status) => {
      if (status.error) {
        console.error("VIDEO ERROR:", status.error);
      }
    });
    return () => subscription.remove();
  }, [player])

  /**
   * Loading state
   */
  if (!videos.length) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Text>
          No videos available
        </Text>
      </View>
    );
  }

  if (currentVideo?.rotate) {
    return (
      <View style={styles.portraitCard}>
        <View style={styles.videoContainer}>
          <VideoView
            player={player}
            style={styles.portraitVideo}
            contentFit="contain"
            nativeControls={false}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.landscapeCard}>
      <View style={styles.videoContainer}>
        <VideoView
          player={player}
          style={styles.video}
          contentFit="contain"
          nativeControls={false}
        />
      </View>
    </View>
  );
};