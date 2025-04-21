'use client';

import { scanWithSlidingWindow } from './qrScanner';
import { ScannerSettings } from '../types';

export const processImageFile = (
    imageSource: string,
    scannerSettings: ScannerSettings,
    debugCanvasRef: React.RefObject<HTMLCanvasElement>,
    setIsLoading: (loading: boolean) => void,
    setError: (error: string | null) => void,
    onDebugImage: (imageUrl: string | null) => void,
    onDecode: (data: string) => void
) => {
    setIsLoading(true); // Set loading true for image processing
    setError(null);

    const img = new Image();
    img.crossOrigin = 'Anonymous';

    img.onload = () => {
        try {
            // Create a canvas element
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d', { willReadFrequently: true });

            if (!context) {
                setError('Could not get canvas context');
                setIsLoading(false);
                return;
            }

            // Draw the image to canvas
            canvas.width = img.width;
            canvas.height = img.height;
            context.drawImage(img, 0, 0);

            // Get image data from the canvas
            const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

            // Use advanced scanning method
            const found = scanWithSlidingWindow(
                imageData,
                scannerSettings,
                debugCanvasRef,
                onDebugImage,
                onDecode
            );

            if (!found) {
                setError('No QR code found in the image');
            }

            setIsLoading(false);
        } catch (err) {
            console.error('Error processing image:', err);
            setError('Error processing image. Please try another file.');
            setIsLoading(false);
        }
    };

    img.onerror = () => {
        setError('Failed to load image. Please try another file.');
        setIsLoading(false);
    };

    img.src = imageSource;
}; 