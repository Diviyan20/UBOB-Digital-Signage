import ImageComponent from "@/app/views/components/ImageComponent";
import React from 'react';
import OutletDisplayComponent from "../components/OutletImageComponent";

const MediaScreen: React.FC = () => {
    return(
        <>
        <ImageComponent />
        <OutletDisplayComponent/>
        </>
        
    );
};
export default MediaScreen;