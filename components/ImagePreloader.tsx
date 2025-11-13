// components/ImagePreloader.tsx
import { Image } from 'expo-image';
import React, { useEffect, useRef, useState } from 'react';

interface ImageItem {
  id?: string;
  image?: string | null;
  outlet_name?: string;
  outlet_id?: string;
}

interface ImagePreloaderProps {
  images: ImageItem[];
  onAllImagesLoaded: () => void;
  onProgress?: (loaded: number, total: number) => void;
  onError?: (error: string) => void;
}

const ImagePreloader: React.FC<ImagePreloaderProps> = ({
  images,
  onAllImagesLoaded,
  onProgress,
  onError,
}) => {
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set());
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (images.length === 0) {
      onAllImagesLoaded();
      return;
    }

    let loadedCount = 0;
    const totalImages = images.length;

    const preloadPromises = images.map(async (item, index) => {
      const imageId = item.id || item.outlet_id || `image-${index}`;
      const imageUrl = item.image;

      if (!imageUrl) {
        console.warn(`No image URL for ${item.outlet_name || imageId}`);
        return;
      }

      try {
        // Preload using Image.prefetch (more reliable than render)
        await Image.prefetch(imageUrl);
        
        if (mountedRef.current) {
          loadedCount++;
          setLoadedImages(prev => new Set(prev).add(imageId));
          onProgress?.(loadedCount, totalImages);
          
          console.log(`✅ Preloaded image ${loadedCount}/${totalImages}: ${item.outlet_name || imageId}`);
          
          // Check if all images are loaded
          if (loadedCount === totalImages) {
            onAllImagesLoaded();
          }
        }
      } catch (error) {
        console.error(`Failed to preload image ${item.outlet_name || imageId}:`, error);
        
        if (mountedRef.current) {
          setFailedImages(prev => new Set(prev).add(imageId));
          
          // Continue with other images, but report the error
          onError?.(`Failed to load image: ${item.outlet_name || imageId}`);
          
          loadedCount++; // Still count as "processed"
          onProgress?.(loadedCount, totalImages);
          
          if (loadedCount === totalImages) {
            // Even if some failed, we proceed (they will retry in the component)
            onAllImagesLoaded();
          }
        }
      }
    });

    // Start all preloading operations
    Promise.allSettled(preloadPromises).then(() => {
      if (mountedRef.current) {
        console.log(`🎉 Image preloading completed. ${loadedImages.size} loaded, ${failedImages.size} failed.`);
      }
    });

  }, [images, onAllImagesLoaded, onProgress, onError]);

  // Don't render anything visible - this is just for preloading
  return null;
};

export default ImagePreloader;