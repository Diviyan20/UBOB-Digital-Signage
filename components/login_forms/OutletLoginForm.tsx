import { OutletLoginStyles as styles } from '@/styling/OutletLoginStyles';
import { router } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Image, Pressable, Text, TextInput, View } from 'react-native';
import ImagePreloader from '../image_components/ImagePreloader';
import ErrorOverlayComponent from '../overlays/ErrorOverlayComponent';
import LoggingInOverlayComponent from '../overlays/LogginInOverlayComponent';

const SERVER_URL = "http://10.0.2.2:5000";

const OutletLoginForm: React.FC = () => {
    const [outletId, setOutletId] = useState<string>("");
    const [loading, setLoading] = useState<boolean>(false);
    const [errorVisible, setErrorVisible] = useState(false);
    const [status, setStatus] = useState<"loading" | "fetching_promotions" | "preloading_images" | "success" | "error" | undefined>();
    const [outletData, setOutletData] = useState<any>(null);
    const [imagesToPreload, setImagesToPreload] = useState<any[]>([]);
    const [preloadingProgress, setPreloadingProgress] = useState<{loaded: number, total: number}>({loaded: 0, total: 0});


    // Regular login - Only validate outlet and show media screen
    const handleLogin = async () => {
        if (loading) return;
        if (!outletId.trim()) return;

        try {
            setLoading(true);
            setStatus("loading");
            
            // Check if outlet exists
            const response = await fetch(`${SERVER_URL}/validate_outlet`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({outlet_id: outletId})
            });

            const data = await response.json()
            
            if (response.ok && data.is_valid) {
                // Store outlet data for later use
                setOutletData(data);
                
                // Fetch outlet images for preloading
                setStatus("fetching_promotions");
                
                try {
                    const imagesResponse = await fetch(`${SERVER_URL}/outlet_image_combined`, {
                        method: "POST",
                        headers: {"Content-Type": "application/json"},
                    });
                    
                    const imagesData = await imagesResponse.json();
                    const outletImages = imagesData.media || [];
                    
                    if (outletImages.length === 0) {
                        setStatus("error");
                        setTimeout(() => {
                            router.replace({
                                pathname: '/screens/MediaScreen',
                                params: {outletId}
                            });
                        }, 1500);
                        return;
                    }
                    setImagesToPreload(outletImages);
                    setStatus("preloading_images");
                    setPreloadingProgress({loaded: 0, total: outletImages.length});
                    
                } catch (error) {
                    setStatus("success");
                    setTimeout(() => {
                        router.replace({
                            pathname: '/screens/MediaScreen',
                            params: {outletId}
                        });
                    }, 1500);
                }
                
            } else {
                // Invalid outlet
                setStatus("error");
                setErrorVisible(true);
            }
        } catch (err) {
            Alert.alert(
                "Connection Error",
                "Could not connect to server. Please check:\n" +
                "1. Flask server is running\n" +
                "2. Using correct URL (10.0.2.2:5000 for emulator / https://ubob-digital-signage.onrender.com for APK.)\n" +
                "3. Network connection is active"
            );
        } 
    };

    // Admin login - Validate outlet then move to System Login
    const handleAdminLogin = async () =>{
        const trimmed = outletId.trim();

        if (trimmed){
            const response = await fetch(`${SERVER_URL}/get_outlets`, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({outlet_id: outletId})
            });
        
        const data = await response.json() 

        if (response.ok && data.is_valid){
            router.replace({
                pathname: "/screens/SystemLoginScreen",
                params: {outletId: trimmed, outletName: data.outlet_name} // Pass it to SystemLoginForm to reference it.
            });
            return;

        }
        Alert.alert("Error", "Outlet ID not found!")
        return;
    }

    // No Outlet ID: Go to System Login and enter it there
    router.replace({
        pathname: "/screens/SystemLoginScreen",
        params: {},
    });
};

    // Handle all preloaded Images
    const handleImagesPreloaded = useCallback(() => {
        setStatus("success");
        setTimeout(() => {
            router.replace({
                pathname: '/screens/MediaScreen',
                params: {outletId}
            });
        }, 1500);
    }, [outletId]);

    const handlePreloadingProgress = useCallback((loaded: number, total: number) => {
        setPreloadingProgress({loaded, total});
    }, []);

    const handlePreloadingError = useCallback((error: string) => {
        console.warn("Image preloading error:", error);
    }, []);

    // Helper function to get overlay message based on status
    const getOverlayMessage = () => {
        switch (status) {
            case "loading":
                return "Logging in...";
            case "fetching_promotions":
                return "Fetching Promotions...";
            case "preloading_images":
                const {loaded, total} = preloadingProgress;
                return `Loading Images... (${loaded}/${total})`;
            case "success":
                return "Success! Loading Media...";
            case "error":
                return "Some / All Images may not have loaded in. Consider restarting the app.";
            default:
                return "Loading...";
        }
    };

    return (
        <View style={styles.container}>
            <Image 
            style={styles.imageContainer}
            source={require('../images/Logo.png')}
            />

            <View style={styles.card}>
                <Text style={styles.label}>Outlet ID</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Enter Outlet ID"
                    placeholderTextColor="#BDBDBD"
                    value={outletId}
                    onChangeText={setOutletId}
                    keyboardType="numeric"
                    autoCapitalize="none"
                />

                <Pressable style={styles.loginButton} onPress={handleLogin}>
                    <Text style={styles.loginButtonText}>Log In</Text>
                </Pressable>

                <Pressable style={styles.adminButton} onPress={handleAdminLogin}>
                    <Text style={styles.adminButtonText}>Login as Admin</Text>
                </Pressable>

            </View>
        
            {errorVisible && (
                <ErrorOverlayComponent
                    visible={errorVisible}
                    errorType="invalid_outlet"
                    onRetry={() => setErrorVisible(false)}
                />
            )}
        
            <LoggingInOverlayComponent 
                visible={loading} 
                status={status || "loading"} 
                message={getOverlayMessage()}
            />

            {/* Hidden preloader component */}
            {imagesToPreload.length > 0 && status === "preloading_images" && (
                <ImagePreloader
                    images={imagesToPreload}
                    onAllImagesLoaded={handleImagesPreloaded}
                    onProgress={handlePreloadingProgress}
                    onError={handlePreloadingError}
                />
            )}
        </View>
    );
};

export default OutletLoginForm;