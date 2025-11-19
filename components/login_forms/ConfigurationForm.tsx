import { ConfigurationStyles as styles } from "@/styling/ConfigurationStyles";
import { router } from 'expo-router';
import React, { useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from 'react-native';

interface ConfigurationFormProps {
    deviceId: string;
}

const ConfigurationForm: React.FC<ConfigurationFormProps> = ({ deviceId }) => {
    const [url, setUrl] = useState<string>("");
    const [loading, setLoading] = useState<boolean>(false);

    const handleSubmit = async () => {
        if (loading) {
            console.log("Submit already in progress, ignoring duplicate request");
            return;
        }

        if (!url.trim()) {
            Alert.alert("Missing Field", "Please enter the order tracking URL.");
            return;
        }

        try {
            setLoading(true);

            // Update device credentials
            const response = await fetch(`http://10.0.2.2:5000/update_credentials`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    device_id: deviceId,
                    order_tracking_url: url.trim()
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Failed to update credentials");
            }

            Alert.alert(
                "Success",
                "System configured successfully! The digital signage will now display order tracking.",
                [
                    {
                        text: "OK",
                        onPress: () => {
                            // Navigate back to media screen - it will now show OrderPreparation
                            router.replace({
                                pathname: '/screens/MediaScreen',
                                params: { outletId: deviceId }
                            });
                        }
                    }
                ]
            );

        } catch (err) {
            console.error("Configuration Error:", err);
            Alert.alert(
                "Configuration Error",
                err instanceof Error ? err.message : "Could not configure the system. Please check the URL and try again."
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.card}>
                <Text style={styles.title}>Enter Order Tracking URL</Text>

                <Text style={styles.label}>Order Tracking URL</Text>
                <TextInput
                    style={[styles.input, styles.urlInput]}
                    placeholder="https://your-domain.odoo.com/pos-order-tracking/?access_token=..."
                    placeholderTextColor="#BDBDBD"
                    value={url}
                    onChangeText={setUrl}
                    autoCapitalize="none"
                    autoCorrect={false}
                    multiline={true}
                    numberOfLines={3}
                    keyboardType="url"
                />

                <Pressable 
                    style={[styles.loginButton, loading && styles.disabledButton]} 
                    onPress={handleSubmit}
                    disabled={loading}
                >
                    <Text style={styles.loginButtonText}>
                        {loading ? "Configuring..." : "Configure System"}
                    </Text>
                </Pressable>
            </View>
        </View>
    );
}

export default ConfigurationForm;