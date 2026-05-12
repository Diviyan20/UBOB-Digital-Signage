import { dropdownStyles as styles } from "@/styling/DropdownStyle";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    Text,
    TextInput,
    View
} from "react-native";
import { api } from "./api/client";

interface Outlet {
  outlet_id: string;
  outlet_name: string;
  region_name: string;
}

interface OutletDropdownProps {
  onSelect: (outletId: string) => void;
  prefillId?: string;
}

const OutletDropdownComponent: React.FC<OutletDropdownProps> = ({ onSelect, prefillId }) => {
  const [search, setSearch] = useState("");
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [filtered, setFiltered] = useState<Outlet[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const fetchOutlets = async () => {
      try {
        setLoading(true);
        const response = await fetch(api.outletData, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });
        const data = await response.json();
        if (response.ok) setOutlets(data.outlets || []);
      } catch (err) {
        console.error("Failed to fetch outlets:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchOutlets();
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!search.trim()) {
      setFiltered([]);
      setShowDropdown(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      const results = outlets.filter(
        (o) =>
          o.outlet_id.startsWith(search) ||
          o.outlet_id.endsWith(search) ||
          o.outlet_name.toLowerCase().includes(search.toLowerCase())
      );
      setFiltered(results);
      setShowDropdown(results.length > 0);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, outlets]);

  useEffect(() => {
    if (!prefillId || outlets.length === 0) return;
  
    const match = outlets.find((o) => o.outlet_id === prefillId);
    if (match) {
      setSearch(`${match.outlet_id} - ${match.outlet_name}`);
      setShowDropdown(false);
      onSelect(match.outlet_id);
    }
  }, [prefillId, outlets]);

  const handleSelect = useCallback(
    (outlet: Outlet) => {
      setSearch(`${outlet.outlet_id} - ${outlet.outlet_name}`);
      setShowDropdown(false);
      onSelect(outlet.outlet_id);
    },
    [onSelect]
  );

  return (
    <View style={styles.container}>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Enter Outlet ID or Name..."
          placeholderTextColor="#BDBDBD"
          value={search}
          onChangeText={setSearch}
          keyboardType="numeric"
          autoCapitalize="none"
        />
        {loading && <ActivityIndicator size="small" color="#888" style={styles.spinner} />}
      </View>

      {showDropdown && (
        <View style={styles.dropdown}>
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.outlet_id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item, index }) => (
              <Pressable
                style={({ pressed }) => [
                  styles.dropdownItem,
                  pressed && styles.dropdownItemPressed,
                  focusedIndex === index && styles.dropdownItemFocused,
                ]}
                onPress={() => handleSelect(item)}
                onFocus={() => setFocusedIndex(index)}
                onBlur={() => setFocusedIndex(null)}
                onHoverIn={() => setFocusedIndex(index)}
                onHoverOut={() => setFocusedIndex(null)}
              >
                <Text style={[styles.outletId, focusedIndex === index && styles.focusedText]}>
                {item.outlet_id}
                </Text>
                <Text style={[styles.outletName, focusedIndex === index && styles.focusedText]}>
                {item.outlet_name}
                </Text>
                <Text style={[styles.outletRegion, focusedIndex === index && styles.focusedText]}>
                {item.region_name}
                </Text>
              </Pressable>
            )}
          />
        </View>
      )}
    </View>
  );
};

export default OutletDropdownComponent;