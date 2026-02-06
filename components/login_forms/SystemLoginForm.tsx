import { ConfigurationStyles as styles } from "@/styling/ConfigurationStyles";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import OutletDropdown from "../input_fields/OutletDropdown";


const SERVER_URL = "https://ubob-digital-signage.onrender.com";

const SystemLoginForm: React.FC = () => {
    // Get params from navigation
    const {outletId: navOutletId, outletName: navOutletName} = useLocalSearchParams<{
        outletId?: string;
        outletName?: string;
    }>();

    const [outletId, setOutletId] = useState<string>(navOutletId || "");
    const [outletName, setOutletName] = useState<string>("");
    const [username, setUsername] = useState<string>("");
    const [password, setPassword] = useState<string>("");
    const [loading, setLoading] = useState<boolean>(false);

    const handleOutletChange = (id: string, name: string) =>{
        setOutletId(id);
        setOutletName(name);
    }
    
    const handleLogin = async () => {
        if (loading) return;

        // Check if all fields filled
        if (!username.trim() || !password.trim()) {
            Alert.alert("Missing Fields", "Please enter both username and password.");
            return;
        }

        // Check admin credentials
        if (username !== "admin" || password !== "1234"){
            Alert.alert("Invalid Credentials", "Incorrect username or password.");
            return;
        }

        // Check Outlet ID
        if (!outletId.trim()){
            Alert.alert("Missing Field" ,"Please Enter Outlet ID.");
            return;
        }

        try {
            setLoading(true);

            // Navigate to configuration form
            router.replace({
                pathname: '/screens/ConfigurationScreen',
                params: { deviceId: outletId.trim() }
            });
        } 
        
        catch (err) {
            Alert.alert("Error", "Login Failed");
        } 
        
        finally {
            setLoading(false);
        }
    };

    return(
        <View style={styles.container}>
            <View style={styles.card}>
                <Text style={styles.title}>System Configuration</Text>
                
                <OutletDropdown
                    value={outletId}
                    onChange={handleOutletChange}
                    disabled={!!navOutletId}
                    placeholder="Search Outlet ID..."
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