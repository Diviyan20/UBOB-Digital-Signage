import {
  loadPreparedSignageVideos,
  PreparedSignageVideo,
} from "@/frontend/services/MediaService";
import { VideoStyles } from "@/styling/MediaStyles";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useEffect, useRef, useState } from "react";
import { Text, useWindowDimensions, View } from "react-native";

interface Props {
  videoIndex: number;
  onVideoFinished: () => void;
  onPlaybackStarted: () => void;
}

const DEV_BLOCK_PLAYBACK = false;

export const VideoComponent = ({
  videoIndex,
  onVideoFinished,
  onPlaybackStarted,
}: Props) => {
  const { width, height } = useWindowDimensions();
  const styles = VideoStyles(width, height);

  const [video, setVideo] = useState<PreparedSignageVideo | null>(null);

  const isMounted = useRef(true);
  const hasSignaledPlayback = useRef(false);
  const finishedRef = useRef(false);

  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
  });

  // ---------------------------------------------------------------------------
  // Mount / unmount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    isMounted.current = true;

    return () => {
      isMounted.current = false;
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Load ONLY the requested video
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const loadVideo = async () => {
      try {
        console.log(`[VIDEO] Loading signage video at index ${videoIndex}`);

        const preparedVideos = await loadPreparedSignageVideos();

        if (!isMounted.current) {
          return;
        }

        if (preparedVideos.length === 0) {
          console.warn("[VIDEO] No prepared signage videos found");

          onVideoFinished();
          return;
        }

        /*
         * Protect against an index that is larger than the
         * currently available playlist.
         */
        const safeIndex = videoIndex % preparedVideos.length;

        const selectedVideo = preparedVideos[safeIndex];

        if (!selectedVideo) {
          console.warn(`[VIDEO] No video found at index ${safeIndex}`);

          onVideoFinished();
          return;
        }

        console.log(
          `[VIDEO] Selected ${safeIndex + 1}/${preparedVideos.length}: ${selectedVideo.key}`,
        );

        console.log(`[VIDEO] Local URI: ${selectedVideo.localUri}`);

        setVideo(selectedVideo);
      } catch (error) {
        console.error("[VIDEO] Failed to load signage videos:", error);

        onVideoFinished();
      }
    };

    void loadVideo();
  }, [videoIndex, onVideoFinished]);

  // ---------------------------------------------------------------------------
  // Play selected video
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!video?.localUri) {
      return;
    }

    const playVideo = async () => {
      try {
        if (DEV_BLOCK_PLAYBACK) {
          console.warn("[DEV] Playback blocked");
          return;
        }

        if (!isMounted.current) {
          return;
        }

        console.log(`[VIDEO] Playing: ${video.key}`);

        await player.replaceAsync(video.localUri);

        if (!isMounted.current) {
          return;
        }

        player.loop = false;
        player.play();

        console.log("[VIDEO] play() called");
      } catch (error) {
        console.error(`[VIDEO] Failed to play ${video.key}:`, error);

        if (isMounted.current && !finishedRef.current) {
          finishedRef.current = true;
          onVideoFinished();
        }
      }
    };

    void playVideo();
  }, [video, player, onVideoFinished]);

  // ---------------------------------------------------------------------------
  // Playback started
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!video) {
      return;
    }

    const subscription = player.addListener("statusChange", (status) => {
      if (status.status === "readyToPlay" && !hasSignaledPlayback.current) {
        hasSignaledPlayback.current = true;

        console.log(`[VIDEO] Playback ready: ${video.key}`);

        onPlaybackStarted();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [player, video, onPlaybackStarted]);

  // ---------------------------------------------------------------------------
  // Video finished
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const subscription = player.addListener("playToEnd", () => {
      if (!isMounted.current || finishedRef.current) {
        return;
      }

      finishedRef.current = true;

      console.log(`[VIDEO] Finished: ${video?.key ?? "unknown"}`);

      onVideoFinished();
    });

    return () => {
      subscription.remove();
    };
  }, [player, video, onVideoFinished]);

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  useEffect(() => {
    return () => {
      console.log("[VIDEO] Releasing player");

      try {
        player.release();
      } catch (error) {
        console.warn("[VIDEO] Failed to release player:", error);
      }
    };
  }, [player]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!video) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Text>Loading video...</Text>
      </View>
    );
  }

  if (video.rotate) {
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
