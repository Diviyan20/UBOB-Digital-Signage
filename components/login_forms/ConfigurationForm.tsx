import { ConfigurationStyles as styles } from "@/styling/ConfigurationStyles";
import React, { useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from 'react-native';


const ConfigurationForm: React.FC = () => {
    const [url, setUrl] = useState<string>("");
    const [loading, setLoading] = useState<boolean>(false);

    const handleSubmit = async () => {
        if (loading) {
            console.log("Submit already in progress, ignoring duplicate request");
            return;
        }

        if (!url.trim()) {
            Alert.alert("Missing Field", "Please enter a URL.");
            return;
        }

        try {
            setLoading(true);

            // Handle URL submission logic
            console.log("Submitting URL: ", url.trim())

            /*
                Your URL handling logic goes here......

            */

            Alert.alert("Success", "URL submitted successfully!");
        }

        catch (err) {
            console.error("Network/Parsing Error:", err);
            Alert.alert(
                "Connection Error",
                "Could not connect to server. Please check your network connection."
            );
        }

        finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.card}>
                <Text style={styles.title}>Enter URL for Outlet configuration</Text>

                <Text style={styles.label}>URL</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Enter URL"
                    placeholderTextColor="#BDBDBD"
                    value={url}
                    onChangeText={setUrl}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                />

                <Pressable style={styles.loginButton} onPress={handleSubmit} disabled={loading}>
                    <Text style={styles.loginButtonText}>
                        {loading ? "Submitting..." : "Submit"}
                    </Text>
                </Pressable>
            </View>
        </View>
    );
}

export default ConfigurationForm;