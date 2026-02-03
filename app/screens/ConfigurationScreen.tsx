import ConfigurationForm from "@/components/login_forms/ConfigurationForm";
import { useLocalSearchParams } from "expo-router";
import React from "react";
import { View } from "react-native";

const ConfigurationScreen = () => {
    const { deviceId } = useLocalSearchParams();

    console.log("Device ID: ", deviceId);

    return (
        <View style={{ flex: 1 }}>
            <ConfigurationForm deviceId={deviceId as string} />
        </View>
    );
};

export default ConfigurationScreen;