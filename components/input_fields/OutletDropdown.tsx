import { dropdownStyles } from "@/styling/DropdownStyle";
import React, { useEffect, useState } from "react";
import { FlatList, Text, TextInput, TouchableOpacity, View } from "react-native";

const SERVER_URL = "https://ubob-digital-signage.onrender.com";

interface OutletProps{
    outlet_id: string;
    outlet_name: string;
}

interface OutletDropdownProps{
    value: string;
    onChange: (outletId: string, outletName: string) => void;
    disabled?: boolean;
    placeholder?: string;
}

const OutletDropdown: React.FC<OutletDropdownProps> = ({
    value, 
    onChange,
    disabled = false,
    placeholder = "Search for Outlet ID...."
    
}) =>{
    const [searchText, setSearchText] = useState<string>(value);
    const [outlets, setOutlets] = useState<OutletProps[]>([]);
    const [filteredOutlets, setFilteredOutlets] = useState<OutletProps[]>([]);
    const [showDropdown, setShowDropdown] = useState<boolean>(false);
    const [selectedOutletName, setSelectedOutletName] = useState<string>("");

    // Fetch outlets on Mount
    useEffect(() =>{
        fetchOutlets();
    }, []);

    // Filter outlets when search text changes
    useEffect(() =>{
        if (searchText.trim() == ""){
            setFilteredOutlets([]);
            setShowDropdown(false);
            return;
        }

        const filtered = outlets.filter(outlet =>
            outlet.outlet_id.includes(searchText) ||
            outlet.outlet_name.toLowerCase().includes(searchText.toLocaleLowerCase())
        );

        setFilteredOutlets(filtered);
        setShowDropdown(filtered.length > 0);
    }, [searchText, outlets]);

    const fetchOutlets = async () =>{
        try{
            const response = await fetch(`${SERVER_URL}/get_all_outlets`,{
                method: "GET",
                headers: {"Content-Type": "application/json"}
            });

            const data = await response.json();

            if(response.ok && data.outlets){
                setOutlets(data.outlets);
            }
        }

        catch(err){
            console.error("Failed to fetch outlets:", err);
        }
    };

    const handleSelect = (outlet: OutletProps) =>{
        setSearchText(outlet.outlet_id);
        setSelectedOutletName(outlet.outlet_name);
        setShowDropdown(false);
        onChange(outlet.outlet_id, outlet.outlet_name);
    };

    const handleTextChange = (text:string) =>{
        setSearchText(text);
        setSelectedOutletName("");
    };

    return( <View>
    <TextInput
        style={dropdownStyles.input}
        placeholder={placeholder}
        placeholderTextColor="#BDBDBD"
        value={searchText}
        onChangeText={handleTextChange}
        editable={!disabled}
        keyboardType="numeric"
        autoCapitalize="none"
    />

    {showDropdown && !disabled && (
        <View style={dropdownStyles.dropdown}>
            <FlatList
                data={filteredOutlets}
                keyExtractor={(item) => item.outlet_id}
                renderItem={({ item }) => (
                    <TouchableOpacity
                        style={dropdownStyles.item}
                        onPress={() => handleSelect(item)}
                    >
                        <Text style={dropdownStyles.itemId}>{item.outlet_id}</Text>
                        <Text style={dropdownStyles.itemName}>{item.outlet_name}</Text>
                    </TouchableOpacity>
                )}
                style={dropdownStyles.list}
                nestedScrollEnabled
            />
        </View>
    )}

    {selectedOutletName && (
        <Text style={dropdownStyles.selectedText}>
            Selected: {selectedOutletName}
        </Text>
    )}
</View>
    );
};

export default OutletDropdown;