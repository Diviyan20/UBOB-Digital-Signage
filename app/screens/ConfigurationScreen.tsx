import ConfigurationForm from "@/components/login_forms/ConfigurationForm";
import { useLocalSearchParams } from "expo-router";
import React from "react";
import { View } from "react-native";

const ConfigurationScreen = () => {
    const { outlet_id } = useLocalSearchParams<{outlet_id?: string}>();

    console.log("Device ID: ", outlet_id);

    return (
        <View style={{ flex: 1 }}>
            <ConfigurationForm outlet_id={outlet_id || ""} />
        </View>
    );
};

export default ConfigurationScreen;