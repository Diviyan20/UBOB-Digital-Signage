import React, { useState } from "react";
import {
    ActivityIndicator,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";

interface Props {
  visible: boolean;
  version: string;
  sizeLabel: string;
  onUpdate: () => Promise<void>;
}

export const UpdateOverlay: React.FC<Props> = ({
  visible,
  version,
  sizeLabel,
  onUpdate,
}) => {
  const [downloading, setDownloading] = useState(false);

  const handleUpdate = async () => {
    setDownloading(true);
    await onUpdate(); // app restarts inside here, so nothing after this runs
  };

  return (
    <Modal transparent animationType="fade" visible={visible}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Update Available</Text>

          <View style={styles.infoRow}>
            <Text style={styles.label}>Version</Text>
            <Text style={styles.value}>{version}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.label}>Size</Text>
            <Text style={styles.value}>{sizeLabel}</Text>
          </View>

          {downloading ? (
            <View style={styles.downloadingRow}>
              <ActivityIndicator color="#2563EB" size="small" />
              <Text style={styles.downloadingText}>Downloading...</Text>
            </View>
          ) : (
            <Pressable style={styles.updateButton} onPress={handleUpdate}>
              <Text style={styles.updateButtonText}>Update</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },

  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 28,
    width: 320,
    alignItems: "center",
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    gap: 12,
  },

  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F4E79",
    marginBottom: 8,
  },

  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    paddingHorizontal: 4,
  },

  label: {
    fontSize: 14,
    color: "#888",
    fontWeight: "500",
  },

  value: {
    fontSize: 14,
    color: "#333",
    fontWeight: "600",
  },

  updateButton: {
    backgroundColor: "#FFE24A",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 48,
    marginTop: 8,
  },

  updateButtonText: {
    color: "#000",
    fontSize: 15,
    fontWeight: "600",
  },

  downloadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 8,
  },

  downloadingText: {
    fontSize: 14,
    color: "#555",
    fontWeight: "500",
  },
});
