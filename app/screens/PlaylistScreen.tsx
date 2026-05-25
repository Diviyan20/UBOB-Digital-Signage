import { PlaylistComponent } from "@/components/media_components/PlaylistComponent";
import { VideoScreenStyle as styles } from "@/styling/MediaStyles";
import { View } from "react-native";

export default function PlaylistScreen() {
  return (
    <View style={styles.container}>
      <PlaylistComponent />
    </View>
  );
}