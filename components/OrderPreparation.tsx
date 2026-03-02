import Constants from 'expo-constants';
import React from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from 'react-native-webview';

interface OrderPreparationProps{
    orderTrackingUrl?: string;
}

const OrderPreparation: React.FC<OrderPreparationProps> = ({orderTrackingUrl}) =>{
    // Use dynamic URL, otherwise fallback to hardcoded version
    const EXPO_PUBLIC_ORDER_TRACKING_BASE_URL = orderTrackingUrl || Constants.expoConfig?.extra?.EXPO_PUBLIC_ORDER_TRACKING_BASE_URL;
    
    return(
        <>
        <View style={styles.container}>
            <WebView
            source={{ uri: EXPO_PUBLIC_ORDER_TRACKING_BASE_URL }}
            style={styles.webview}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            mixedContentMode="always"
            originWhitelist={['*']}
            allowsInlineMediaPlayback
            startInLoadingState
            />
        </View>
        </>
    );
};

const styles = StyleSheet.create({
    container:{
        flex: 1,
        borderRadius: 20,
        overflow: "hidden",
        backgroundColor: "#fff",
    },
    webview:{
        flex: 1,
    },
});

export default OrderPreparation;