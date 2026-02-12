import { ConfigurationStyles as styles } from "@/styling/ConfigurationStyles";
import { router } from 'expo-router';
import React, { useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from 'react-native';

interface ConfigurationFormProps {
    deviceId: string;
}

const SERVER_URL = "http://10.0.2.2:5000";

const ConfigurationForm: React.FC<ConfigurationFormProps> = ({ deviceId }) => {
    const [accessToken, setAccessToken] = useState<string>("");
    const [loading, setLoading] = useState<boolean>(false);

    // Load base URL from environment variables
    const baseUrl = process.env.EXPO_PUBLIC_ORDER_TRACKING_BASE_URL;

    if (!baseUrl) {
        Alert.alert("Error", "Base URL missing");
        return null;
      }
      
    const handleSubmit = async () => {
        if (loading) return;

        if (!accessToken.trim()) {
            Alert.alert("Missing Field", "Please enter the access token.");
            return;
        }

        try {
            setLoading(true);

            // Build Full URL
            const fullUrl = `${baseUrl}/?access_token=${accessToken.trim()}`;

            // Update device credentials
            const response = await fetch(`${SERVER_URL}/configure_device`, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    device_id: deviceId,
                    order_tracking_url: fullUrl
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Configuration Failed!");
            }

            Alert.alert(
                "Success",
                "Device Configured Successfully!",
                [
                    {
                        text: "OK",
                        onPress: () => {
                            // Navigate back to media screen - it will now show the order preparation component
                            router.replace({
                                pathname: '/screens/MediaScreen',
                                params: { outletId: deviceId }
                            });
                        }
                    }
                ]
            );

        } 
        
        catch (err) {
            Alert.alert(
                "Configuration Error",
                err instanceof Error ? err.message : "Could not configure the system. Please check the URL and try again."
            );
        } 
        
        finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.card}>
                <Text style={styles.title}>Configure Order Tracking</Text>

                <Text style={styles.label}>URL</Text>
                <TextInput
                    style={[styles.input, styles.readOnlyInput]}
                    value={baseUrl}
                    editable={false}
                    selectTextOnFocus={false}
                    placeholder="Loading base URL...."
                    placeholderTextColor='#BDBDBD'
                    multiline={true}
                    numberOfLines={2}
                />

                <Text style={styles.label}>Access Token</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Enter access token..."
                    placeholderTextColor='#BDBDBD'
                    value={accessToken}
                    onChangeText={setAccessToken}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry={false} // Activate if you want to hide the token
                ></TextInput>

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