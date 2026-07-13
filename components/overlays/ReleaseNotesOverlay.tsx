import React, { useState } from "react";
import {
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";

interface Props {
  visible: boolean;
  version: string;
  notes: string[];
  onClose: () => void;
}

export const ReleaseNotesOverlay: React.FC<Props> = ({
  visible,
  version,
  notes,
  onClose,
}) => {
  const [focused, setFocused] = useState(false);

  return (
    <Modal transparent animationType="fade" visible={visible}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>What's New</Text>
          <Text style={styles.version}>Version {version}</Text>

          <ScrollView
            style={styles.notesList}
            contentContainerStyle={styles.notesContent}
          >
            {notes.map((note, index) => (
              <View key={index} style={styles.noteRow}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.noteText}>{note}</Text>
              </View>
            ))}
          </ScrollView>

          <Pressable
            style={[styles.closeButton, focused && styles.closeButtonFocused]}
            onPress={onClose}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          >
            <Text style={styles.closeButtonText}>Close</Text>
          </Pressable>
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
    width: 340,
    maxHeight: "70%",
    alignItems: "center",
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },

  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F4E79",
    marginBottom: 4,
  },

  version: {
    fontSize: 12,
    color: "#888",
    marginBottom: 16,
  },

  notesList: {
    width: "100%",
    marginBottom: 16,
  },

  notesContent: {
    gap: 10,
  },

  noteRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },

  bullet: {
    fontSize: 14,
    color: "#2563EB",
    lineHeight: 20,
  },

  noteText: {
    flex: 1,
    fontSize: 14,
    color: "#333",
    lineHeight: 20,
  },

  closeButton: {
    backgroundColor: "#f0f0f0",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 48,
    marginTop: 4,
  },

  closeButtonText: {
    color: "#333",
    fontSize: 15,
    fontWeight: "600",
  },

  closeButtonFocused: {
    borderColor: "#FFD700",
    borderWidth: 3,
    transform: [{ scale: 1.03 }],
  },
});
