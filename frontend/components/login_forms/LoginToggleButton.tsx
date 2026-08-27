import { OutletLoginStyles as styles } from "@/styling/OutletLoginStyles";
import React from "react";
import { Pressable, Text } from "react-native";

interface LoginToggleButtonProps {
  label: string;
  active: boolean;
  disabled?: boolean;
  focused?: boolean;
  onPress?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

/**
 * Reusable TV-friendly toggle button.
 *
 * Used for:
 * - Signage Screen / Media Player
 * - Landscape / Portrait
 */
export const LoginToggleButton: React.FC<LoginToggleButtonProps> = ({
  label,
  active,
  disabled = false,
  focused = false,
  onPress,
  onFocus,
  onBlur,
}) => {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      onFocus={onFocus}
      onBlur={onBlur}
      style={[
        styles.toggleButton,
        active && styles.toggleButtonActive,
        disabled && styles.disabledButton,
        focused && styles.focusedButton,
      ]}
    >
      <Text
        style={[
          styles.toggleText,
          active && styles.toggleTextActive,
          disabled && styles.disabledText,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
};
