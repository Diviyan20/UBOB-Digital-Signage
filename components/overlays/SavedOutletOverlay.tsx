import { OutletLoginStyles as styles } from '@/styling/OutletLoginStyles';
import React, { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

interface SavedOutlet {
    id: string;
    name: string;
}

interface SavedOutletOverlayProps {
    visible: boolean;
    savedOutlet: SavedOutlet | null;
    onUseSaved: () => void;
    onIgnoreSaved: () => void;
}

export default function SavedOutletOverlay({
    visible,
    savedOutlet,
    onUseSaved,
    onIgnoreSaved,
}: SavedOutletOverlayProps) {
    const [focusedButton, setFocusedButton] = useState<"yes" | "no" | null>(null);

    return (
        <Modal
            transparent
            animationType="fade"
            visible={visible && !!savedOutlet}
        >

            <View style={styles.overlay}>
                <View style={styles.popupCard}>

                    <Text style={styles.title}> Welcome Back! </Text>

                    <Text style={styles.message}> Continue with saved outlet? </Text>

                    <Text style={styles.outletInfo}> {savedOutlet?.id} — {savedOutlet?.name} </Text>

                    <View style={styles.buttonRow}>
                        <Pressable
                            style={[
                                styles.button,
                                styles.yesButton,
                                focusedButton === "yes" && styles.yesButtonFocused
                            ]}
                            onPress={onUseSaved}
                            onFocus={() => setFocusedButton("yes")}
                            onBlur={() => setFocusedButton(null)}
                            onHoverIn={() => setFocusedButton("yes")}
                            onHoverOut={() => setFocusedButton(null)}>
                            <Text style={styles.yesText}> Yes </Text>
                        </Pressable>

                        <Pressable
                            style={[
                                styles.button,
                                styles.noButton,
                                focusedButton === "no" && styles.noButtonFocused
                            ]}
                            onPress={onIgnoreSaved}
                            onFocus={() => setFocusedButton("no")}
                            onBlur={() => setFocusedButton(null)}
                            onHoverIn={() => setFocusedButton("no")}
                            onHoverOut={() => setFocusedButton(null)}
                        >
                            <Text style={styles.noText}> No </Text>
                        </Pressable>
                    </View>

                </View>
            </View>

        </Modal>
    );
}