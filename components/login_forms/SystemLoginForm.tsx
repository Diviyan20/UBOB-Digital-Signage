import { ConfigurationStyles as styles } from "@/styling/ConfigurationStyles";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from 'react-native';


const SERVER_URL = "https://ubob-digital-signage.onrender.com";

const SystemLoginForm: React.FC = () => {
    const { outletId, outletName } = useLocalSearchParams<{ outletId?: string; outletName?: string }>();
    
    const [outletIdState, setOutletIdState] = useState<string>(outletId || "");
    const [outletNameDisplay, setOutletNameDisplay] = useState<string | null>(outletName ?? null);
    const [outletSearching, setOutletSearching] = useState(false);
    const [username, setUsername] = useState<string>("");
    const [password, setPassword] = useState<string>("");
    const [loading, setLoading] = useState<boolean>(false);

    // Show outlet name if provided
    useEffect(() => {
        if (outletId && outletName != null) setOutletNameDisplay(outletName);
    }, [outletId, outletName]);

    // Search for outlet using Debounced Search
    useEffect(() => {
        if (outletId) return; // Skip if Outlet ID already provided

        const trimmed = outletIdState.trim();
        if (!trimmed) {
            setOutletNameDisplay(null);
            return;
        }
        const timer = setTimeout(async () => {
            setOutletSearching(true);

            try {
                const res = await fetch(`${SERVER_URL}/validate_outlet`, {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({ outlet_id: trimmed }),
                });

                const data = await res.json();

                if (res.ok && data.is_valid){
                    setOutletNameDisplay(data.outlet_name ?? "—");
                }
            } 
            
            catch {
                setOutletNameDisplay("No outlets");
            } 
            
            finally {
                setOutletSearching(false);
            }
        }, 400);

        return () => clearTimeout(timer);
    }, [outletId, outletIdState]);

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
        if (!outletIdState.trim()){
            Alert.alert("Missing Field" ,"Please Enter Outlet ID.");
            return;
        }

        try {
            setLoading(true);

            // Navigate to configuration form
            router.replace({
                pathname: '/screens/ConfigurationScreen',
                params: { deviceId: outletIdState.trim() }
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

                {outletNameDisplay != null && (
                    <Text style={styles.outletNameText}>
                        {outletSearching ? "Checking…" : `Outlet: ${outletNameDisplay}`}
                    </Text>
                )}
                
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