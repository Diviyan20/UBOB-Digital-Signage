import { MixedMediaPlayer } from "@/components/media_components/MixedMediaPlayer";
import { VideoScreenStyle as styles } from "@/styling/MediaStyles";
import { View } from "react-native";

export default function VideoScreen() {
  return (
    <View style={styles.container}>
      <MixedMediaPlayer />
    </View>
  );
}