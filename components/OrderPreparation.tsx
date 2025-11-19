import Constants from 'expo-constants';
import React from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from 'react-native-webview';

interface OrderPreparationProps{
    orderTrackingUrl?: string;
}

const OrderPreparation: React.FC<OrderPreparationProps> = ({orderTrackingUrl}) =>{
    // Use dyanmic URL, otherwise fallback to hardcoded version
    const ORDER_TRACKING_URL = orderTrackingUrl || Constants.expoConfig?.extra?.ORDER_TRACKING_URL;;
    
    return(
        <>
        <View style={styles.container}>
            <WebView
            source={{ uri: ORDER_TRACKING_URL }}
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