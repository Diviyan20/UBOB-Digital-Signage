import { ErrorOverlayStyle as styles } from "@/styling/ErrorOverlayStyle";
import { Overlay } from "@rneui/themed";
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

  // ✅ Shared focus logic
  const useFocusOnMount = (ref: React.RefObject<any>) => {
    useEffect(() => {
      const timeout = setTimeout(() => {
        const node = findNodeHandle(ref.current);
        if (node) AccessibilityInfo.setAccessibilityFocus(node);
      }, 150);
      return () => clearTimeout(timeout);
    }, []);
  };

  // --- Invalid Outlet Overlay ---
  const InvalidOutletOverlay: React.FC<{ onRetry: () => void }> = ({
    onRetry,
  }) => {
    const retryButtonRef = useRef<any>(null);
    useFocusOnMount(retryButtonRef);

    return (
      <Overlay
        isVisible
        overlayStyle={[styles.outletContainer, { zIndex: 9999 }]}
        backdropStyle={{ pointerEvents: "auto" }}
      >
        <View>
          <Text style={styles.outletTextPrimary}>Invalid Outlet Code</Text>
          <Text style={styles.outletTextSecondary}>
            Please re-enter the code.
          </Text>
          <Pressable
            ref={retryButtonRef}
            style={styles.outletButton}
            onPress={onRetry}
            focusable={true}
            {...(Platform.isTV && { hasTVPreferredFocus: true })}
          >
            <Text style={styles.outletButtonText}>Try Again</Text>
          </Pressable>
        </View>
      </Overlay>
    );
  };

  // --- Media Error Overlay ---
  const MediaErrorOverlay: React.FC<{ onRetry: () => void }> = ({ onRetry }) => {
    const refreshButtonRef = useRef<any>(null);
    useFocusOnMount(refreshButtonRef);

    return (
      <Overlay
        isVisible
        overlayStyle={[styles.mediaContainer, { zIndex: 9999 }]}
        backdropStyle={{ pointerEvents: "auto" }}
      >
        <View>
          <Text style={styles.mediaTextPrimary}>Oops! Nothing’s showing.</Text>
          <Text style={styles.mediaTextSecondary}>
            Give us a minute or refresh the media screen.
          </Text>
          <Pressable
            ref={refreshButtonRef}
            style={styles.mediaButton}
            onPress={onRetry}
            focusable={true}
            {...(Platform.isTV && { hasTVPreferredFocus: true })}
          >
            <Text style={styles.mediaButtonText}>Refresh</Text>
          </Pressable>
        </View>
      </Overlay>
    );
  };

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
