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

    const handleLogin = async () => {
        if (loading) {
            console.log("Login already in progress, ignoring duplicate request");
            return;
        }

        if (!outletId.trim()) {
            console.warn("Missing Field", "Please enter your Outlet ID.");
            return;
        }

        try {
            setLoading(true);
            setStatus("loading");
            
            // Step 1: Validate outlet ID
            const response = await fetch(`${SERVER_URL}/get_outlets`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ outlet_id: outletId })
            });

            const data = await response.json() as { 
                is_valid: boolean; 
                outlet_name?: string; 
                region_name?: string; 
                device_info?: any 
            };
            
            if (response.ok && data.is_valid) {
                // Store outlet data for later use
                setOutletData(data);
                
                // Step 2: Fetch outlet images for preloading
                setStatus("fetching_promotions");
                console.log("📱 Outlet validated, fetching promotions...");
                
                try {
                    const imagesResponse = await fetch(`${SERVER_URL}/outlet_image_combined`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                    });
                    
                    if (!imagesResponse.ok) {
                        throw new Error(`Failed to fetch outlet images: ${imagesResponse.status}`);
                    }
                    
                    const imagesData = await imagesResponse.json();
                    const outletImages = imagesData.media || [];
                    
                    if (outletImages.length === 0) {
                        console.warn("No outlet images found, proceeding without preloading");
                        setStatus("success");
                        setTimeout(() => {
                            router.replace({
                                pathname: '/screens/MediaScreen',
                                params: { 
                                    outletId,
                                    outletName: data.outlet_name,
                                    regionName: data.region_name
                                }
                            });
                        }, 5000);
                        return;
                    }
                    
                    console.log(`📋 Found ${outletImages.length} outlet images to preload`);
                    setImagesToPreload(outletImages);
                    
                    // Step 3: Start preloading phase
                    setStatus("preloading_images");
                    setLoading(true);
                    setPreloadingProgress({loaded: 0, total: outletImages.length});
                    
                } catch (error) {
                    console.warn("Failed to fetch outlet images, proceeding without preloading:", error);
                    setStatus("success");
                    setTimeout(() => {
                        router.replace({
                            pathname: '/screens/MediaScreen',
                            params: { 
                                outletId,
                                outletName: data.outlet_name,
                                regionName: data.region_name,
                                preloadWarning: "true"
                            }
                        });
                    }, 5000);
                }
                
            } else {
                // Invalid outlet
                setStatus("error");
                setErrorVisible(true);
            }
        } catch (err) {
            console.error("Network/Parsing Error:", err);
            Alert.alert(
                "Connection Error",
                "Could not connect to server. Please check:\n" +
                "1. Flask server is running\n" +
                "2. Using correct URL (10.0.2.2:5000 for emulator)\n" +
                "3. Network connection is active"
            );
        } 
    };

    const handleAdminLogin = () =>{
        router.replace("/screens/SystemLoginScreen");
    }

    // Handle when all images are preloaded
    const handleImagesPreloaded = useCallback(() => {
        console.log("🎉 All images preloaded successfully!");
        setStatus("success");
        
        setTimeout(() => {
            router.replace({
                pathname: '/screens/MediaScreen',
                params: { 
                    outletId,
                    outletName: outletData?.outlet_name,
                    regionName: outletData?.region_name,
                    imagesPreloaded: "true"
                }
            });
        }, 1500);
    }, [outletId, outletData]);

    // Handle preloading progress
    const handlePreloadingProgress = useCallback((loaded: number, total: number) => {
        setPreloadingProgress({loaded, total});
    }, []);

    // Handle preloading errors
    const handlePreloadingError = useCallback((error: string) => {
        console.warn("Image preloading error:", error);
        // Continue anyway - images will retry in the component
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
            default:
                return "Loading...";
        }
    };

    return (
        <View style={styles.container}>
            <Image 
            style={styles.imageContainer}
            source={require('../images/Logo.png')}/>
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