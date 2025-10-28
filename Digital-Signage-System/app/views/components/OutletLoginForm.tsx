import { OutletLoginStyles as styles } from '@/app/styling/OutletLoginStyles';
import React, { useState } from 'react';
import { Alert, Text, TextInput, TouchableOpacity, View } from 'react-native';
import ErrorOverlayComponent from './ErrorOverlayComponent';


const OutletLoginForm: React.FC = () => {
    const [outletId, setOutletId] = useState<string>("");
    const [loading, setLoading] = useState<boolean>(false);
    const [errorVisible, setErrorVisible] = useState(false);


    const handleLogin = async () => {
        if (!outletId.trim()) {
            console.warn("Missing Field", "Please enter your Outlet ID.");
            return;
        }

        try {
            setLoading(true);
            const response = await fetch("http://127.0.0.1:5000/get_outlets", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ outlet_id: outletId })
            });

            const data = await response.json() as { is_valid: boolean}; // Read JSON output for 'is_valid'
            if (response.ok) {
                if (data.is_valid) {
                    //navigation.navigate("MediaScreen")
                }
                else {
                    setErrorVisible(true);
                }
            }
            else {
                console.error("Server responded with status:", response.status);
                setErrorVisible(true);
            }
        }
        catch (err) {
            console.error("Network/Parsing Error:", err);
            Alert.alert(
                "Connection Error",
                "Could not connect to server. Please check:\n" +
                "1. Flask server is running\n" +
                "2. Using correct URL (10.0.2.2:5000 for emulator)\n" +
                "3. Network connection is active"
            );
        }
        finally {
            setLoading(false);
        }
    };

    return (
        <>
            <View style={styles.formContainer}>
                <Text style={styles.label}>Outlet ID</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Enter Outlet ID"
                    placeholderTextColor="#BDBDBD"
                    value={outletId}
                    onChangeText={setOutletId}
                    keyboardType="numeric" // since it's an ID (number)
                    autoCapitalize="none"
                />
                <TouchableOpacity style={styles.loginButton} onPress={handleLogin}>
                    <Text style={styles.loginButtonText}>Log In</Text>
                </TouchableOpacity>
            </View>
            {errorVisible && (
                <ErrorOverlayComponent
                    visible={errorVisible}
                    errorType="invalid_outlet"
                    onRetry={() => setErrorVisible(false)}
                />

            )}
        </>
    );

};

export default OutletLoginForm;
