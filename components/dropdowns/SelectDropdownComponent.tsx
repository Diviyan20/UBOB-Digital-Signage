import { OutletLoginStyles as styles } from "@/styling/OutletLoginStyles";
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";

interface Option {
    label: string;
    value: string | number;
}

interface SelectDropdownProps {
    options: Option[];
    selectedValue: string | number;
    onSelect: (value: any) => void;
    focused?: boolean;
    onFocus?: () => void;
    onBlur?: () => void;
}

export const SelectDropdown: React.FC<SelectDropdownProps> = ({
    options,
    selectedValue,
    onSelect,
    focused = false,
    onFocus,
    onBlur,
}) => {
    const [isOpen, setIsOpen] = useState(false);

    const selectedLabel = options.find(o => o.value === selectedValue)?.label || "Select...";

    return (
        <View style={styles.dropdownContainer}>

            {/* Trigger — shows selected value */}
            <Pressable
                style={[
                    styles.dropdownTrigger,
                    focused && styles.focusedButton,
                    isOpen && styles.dropdownTriggerOpen,
                ]}
                onPress={() => setIsOpen(prev => !prev)}
                onFocus={onFocus}
                onBlur={onBlur}
            >
                <Text style={styles.dropdownTriggerText}>{selectedLabel}</Text>
                <Text style={styles.dropdownArrow}>{isOpen ? "▲" : "▼"}</Text>
            </Pressable>

            {/* Options list — expands inline */}
            {isOpen && (
                <View style={styles.dropdownList}>
                    {options.map((option) => (
                        <Pressable
                            key={option.value}
                            style={[
                                styles.dropdownOption,
                                option.value === selectedValue && styles.dropdownOptionActive,
                            ]}
                            onPress={() => {
                                onSelect(option.value);
                                setIsOpen(false);
                            }}
                        >
                            <Text
                                style={[
                                    styles.dropdownOptionText,
                                    option.value === selectedValue && styles.dropdownOptionTextActive,
                                ]}
                            >
                                {option.label}
                            </Text>
                        </Pressable>
                    ))}
                </View>
            )}
        </View>
    );
};