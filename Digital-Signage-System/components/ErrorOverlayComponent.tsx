import { ErrorOverlayStyle as styles } from '@/styling/ErrorOverlayStyle';
import { Button, Overlay } from '@rneui/themed';
import React from 'react';
import { Text } from 'react-native';

interface ErrorOverlayProps {
    errorType: "invalid_outlet" | "media_error";
    visible: boolean;
    onRetry: ()=>void;
}


const ErrorOverlayComponent: React.FC<ErrorOverlayProps>= ({ errorType, visible, onRetry }) => {
    if (!visible) return null

    /**
     * Creating 2 separate Error Overlays based on Error type
     * 2 Error Typs: Invalid Outlet Code & Error Fetching Media
     */
    const InvalidOutletOverlay = ({onRetry}: {onRetry: ()=>void}) => (
        <Overlay isVisible overlayStyle={styles.outletContainer}>
            <Text style={styles.outletTextPrimary}>Invalid Outlet Code</Text>
            <Text style={styles.outletTextSecondary}>Please re-enter the code.</Text>
            <Button buttonStyle= {styles.outletButton} onPress={onRetry}>
                <Text style={styles.outletButtonText}>Try Again</Text>
            </Button>
        </Overlay>
    );

    const MediaErrorOverlay = ({onRetry}: {onRetry: ()=>void}) => (
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

    switch (errorType) {
        case "invalid_outlet":
            return <InvalidOutletOverlay onRetry={onRetry} />
        
        case "media_error":
            return <MediaErrorOverlay onRetry={onRetry}/>
    }


};

export default ErrorOverlayComponent;