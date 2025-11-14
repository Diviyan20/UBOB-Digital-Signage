import Constants from 'expo-constants';
import React from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from 'react-native-webview';

const ORDER_TRACKING_URL = Constants.expoConfig?.extra?.ORDER_TRACKING_URL;

const OrderPreparation = () =>{
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