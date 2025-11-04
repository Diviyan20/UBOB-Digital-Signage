import { ErrorOverlayStyle as styles } from "@/styling/ErrorOverlayStyle";
import { Button, Overlay } from "@rneui/themed";
import React, { useEffect, useRef } from "react";
import {
  Pressable,
  Text,
  findNodeHandle,
  AccessibilityInfo,
  View,
  Platform,
} from "react-native";

interface ErrorOverlayProps {
  errorType: "invalid_outlet" | "media_error";
  visible: boolean;
  onRetry: () => void;
}

const ErrorOverlayComponent: React.FC<ErrorOverlayProps> = ({
  errorType,
  visible,
  onRetry,
}) => {
  if (!visible) return null;

  // --- Invalid Outlet Overlay ---
  const InvalidOutletOverlay: React.FC<{ onRetry: () => void }> = ({
    onRetry,
  }) => {
    const retryButtonRef = useRef<any>(null);

    useEffect(() => {
      const timeout = setTimeout(() => {
        const node = findNodeHandle(retryButtonRef.current);
        if (node) {
          AccessibilityInfo.setAccessibilityFocus(node);
        }
      }, 150);
      return () => clearTimeout(timeout);
    }, []);

    return (
      <Overlay
        isVisible
        overlayStyle={styles.outletContainer}
        backdropStyle={{ pointerEvents: "auto" }}
      >
        <View>
          <Text style={styles.outletTextPrimary}>Invalid Outlet Code</Text>
          <Text style={styles.outletTextSecondary}>
            Please re-enter the code.
          </Text>

          {/* Note: nextFocusUp/Down only supported on Android TV runtime */}
          <Pressable
            ref={retryButtonRef}
            style={styles.outletButton}
            onPress={onRetry}
            focusable={true}
            {...(Platform.isTV && {
              hasTVPreferredFocus: true,
            })}
          >
            <Text style={styles.outletButtonText}>Try Again</Text>
          </Pressable>
        </View>
      </Overlay>
    );
  };

  // --- Media Error Overlay ---
  const MediaErrorOverlay: React.FC<{ onRetry: () => void }> = ({ onRetry }) => (
    <Overlay isVisible overlayStyle={styles.mediaContainer}>
      <Text style={styles.mediaTextPrimary}>Oops! Nothing’s showing.</Text>
      <Text style={styles.mediaTextSecondary}>
        Give us a minute or refresh the media screen.
      </Text>
      <Button onPress={onRetry} buttonStyle={styles.mediaButton}>
        <Text style={styles.mediaButtonText}>Refresh</Text>
      </Button>
    </Overlay>
  );

  // --- Render ---
  switch (errorType) {
    case "invalid_outlet":
      return <InvalidOutletOverlay onRetry={onRetry} />;
    case "media_error":
      return <MediaErrorOverlay onRetry={onRetry} />;
    default:
      return null;
  }
};

export default ErrorOverlayComponent;
