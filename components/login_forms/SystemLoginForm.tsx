import { ConfigurationStyles as styles } from "@/styling/ConfigurationStyles";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from 'react-native';


const SystemLoginForm: React.FC = () => {
    const { outletId } = useLocalSearchParams<{ outletId: string }>();
    const [outletIdState, setOutletIdState] = useState<string>(outletId || "");
    const [username, setUsername] = useState<string>("");
    const [password, setPassword] = useState<string>("");
    const [loading, setLoading] = useState<boolean>(false);

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

        // Validate Outlet ID (either from params or user input)
        if (!outletIdState.trim()){
            Alert.alert("Missing Field" ,"Please Enter Outlet ID.");
            return;
        }

        try {
            setLoading(true);
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
                <Text style={styles.label}>Outlet ID</Text>
                <TextInput
                    style={[
                        styles.input,
                        outletId && styles.readOnlyInput
                    ]}
                    placeholder="Enter Outlet ID"
                    placeholderTextColor="#BDBDBD"
                    value={outletIdState}
                    onChangeText={setOutletIdState}
                    editable={!outletId}
                    keyboardType="numeric"
                    autoCapitalize="none"
                    autoCorrect={false}
                />
                
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