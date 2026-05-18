import { OutletLoginStyles as styles } from '@/styling/OutletLoginStyles';
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

interface SavedOutletOverlayProps {
    onUseSaved: (id: string) => void;
}

export default function SavedOutletOverlay({ onUseSaved }: SavedOutletOverlayProps) {
    const [savedOutlet, setSavedOutlet] = useState<{ id: string; name: string } | null>(null);
    const [showSavedPrompt, setShowSavedPrompt] = useState(false);
    const [focusedButton, setFocusedButton] = useState<"yes" | "no" | null>(null);

    const handleUseSaved = () => {
        if (!savedOutlet) return;
        setShowSavedPrompt(false);
        onUseSaved(savedOutlet!.id);
    };
    const handleIgnoreSaved = () => {
        setShowSavedPrompt(false);
        setSavedOutlet(null);
    };
    
    useEffect(() => {
        const loadSavedOutlet = async () => {
            try {
                const saved = await AsyncStorage.getItem("saved_outlet");
                if (saved) {
                    const parsed = JSON.parse(saved);
                    setSavedOutlet(parsed);
                    setShowSavedPrompt(true);
                }
            } catch (err) {
                console.warn("Failed to load saved outlet:", err);
            }
        };
        loadSavedOutlet();
    }, []);
    return (
        <Modal transparent animationType="fade" visible={showSavedPrompt && !!savedOutlet}>
            <View style={styles.overlay}>
                <View style={styles.popupCard}>
                    <Text style={styles.title}>Welcome Back!</Text>
                    <Text style={styles.message}>Continue with saved outlet?</Text>
                    <Text style={styles.outletInfo}>
                        {savedOutlet?.id} — {savedOutlet?.name}
                    </Text>
                    <View style={styles.buttonRow}>
                        <Pressable
                            style={[styles.button, styles.yesButton, focusedButton === "yes" && styles.yesButtonFocused]}
                            onPress={handleUseSaved}
                            onFocus={() => setFocusedButton("yes")}
                            onBlur={() => setFocusedButton(null)}
                            onHoverIn={() => setFocusedButton("yes")}
                            onHoverOut={() => setFocusedButton(null)}
                        >
                            <Text style={styles.yesText}>Yes</Text>
                        </Pressable>
                        <Pressable
                            style={[styles.button, styles.noButton, focusedButton === "no" && styles.noButtonFocused]}
                            onPress={handleIgnoreSaved}
                            onFocus={() => setFocusedButton("no")}
                            onBlur={() => setFocusedButton(null)}
                            onHoverIn={() => setFocusedButton("no")}
                            onHoverOut={() => setFocusedButton(null)}
                        >
                            <Text style={styles.noText}>No</Text>
                        </Pressable>
                    </View>
                </View>
            </View>
        </Modal>
    );
};