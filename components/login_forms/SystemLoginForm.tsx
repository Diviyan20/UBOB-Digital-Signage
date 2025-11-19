import { ConfigurationStyles as styles } from "@/styling/ConfigurationStyles";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from 'react-native';

const SERVER_URL = "http://10.0.2.2:5000"

const SystemLoginForm: React.FC = () => {
    const { outletId } = useLocalSearchParams<{ outletId: string }>();
    const [username, setUsername] = useState<string>("");
    const [password, setPassword] = useState<string>("");
    const [loading, setLoading] = useState<boolean>(false);
    const [errorVisible, setErrorVisible] = useState(false);

    const handleLogin = async () => {
        if (loading) {
            console.log("Login already in progress, ignoring duplicate request");
            return;
        }

        if (!username.trim() || !password.trim()) {
            Alert.alert("Missing Fields", "Please enter both username and password.");
            return;
        }

        // Check admin credentials
        if (username !== "admin" || password !== "1234"){
            Alert.alert("Invalid Credentials", "Incorrect username or password.");
            return;
        }

        try {
            setLoading(true);

            if (!outletId){
                Alert.alert("Error", "Device ID not found. Please try logging in again.");
                return;
            }

            // Navigate to configuration form
            router.replace(`/screens/ConfigurationScreen?deviceId=${outletId}` as any);
        } catch (err) {
            console.error("Login Error: ", err);
            Alert.alert(
                "Login Error",
                err instanceof Error ? err.message : "An unexpected error occurred. Please try again."
            );
        } finally {
            setLoading(false);
        }
    };

    return(
        <View style={styles.container}>
            <View style={styles.card}>
                <Text style={styles.title}>System Configuration</Text>
                
                <Text style={styles.label}>Username</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Enter Username"
                    placeholderTextColor="#BDBDBD"
                    value={username}
                    onChangeText={setUsername}
                    autoCapitalize="none"
                    autoCorrect={false}
                />
                
                <Text style={styles.label}>Password</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Enter Password"
                    placeholderTextColor="#BDBDBD"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={true}
                    autoCapitalize="none"
                    autoCorrect={false}
                />
                
                <Pressable style={styles.loginButton} onPress={handleLogin}>
                    <Text style={styles.loginButtonText}>Log In</Text>
                </Pressable>
            </View>
        </View>
    )
}

export default SystemLoginForm;