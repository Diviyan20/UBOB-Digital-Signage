import { ConfigurationStyles as styles } from "@/styling/ConfigurationStyles";
import React, { useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from 'react-native';

const SERVER_URL = "https://ubob-digital-signage.onrender.com"

const SystemLoginForm: React.FC = () => {
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

        try {
            setLoading(true);

            //Configure login with username and password
        }
        catch (err) {
            console.error("Network / Parsing Error: ", err);
            Alert.alert(
                "Connection Error",
                "Could not connect to server. Please check your network connection."
            )
        }

        finally {
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