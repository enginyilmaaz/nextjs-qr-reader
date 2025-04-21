import jsQR from 'jsqr';
import { ScannerSettings } from '../types';

export const scanWithSlidingWindow = (
    imageData: ImageData,
    scannerSettings: ScannerSettings,
    debugCanvasRef: React.RefObject<HTMLCanvasElement | null>,
    onDebugImage: (imageUrl: string | null) => void,
    onDecode: (data: string) => void
): boolean => {
    if (!jsQR) return false;

    // Original size attempt
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert",
    });

    if (code) {
        onDecode(code.data);
        return true;
    }

    if (!scannerSettings.useAdvancedScanning) {
        return false;
    }

    // Debug canvas setup for visualization
    let debugContext: CanvasRenderingContext2D | null = null;
    if (scannerSettings.debugMode && debugCanvasRef.current) {
        debugCanvasRef.current.width = imageData.width;
        debugCanvasRef.current.height = imageData.height;
        debugContext = debugCanvasRef.current.getContext('2d');

        if (debugContext) {
            // Draw original image to debug canvas
            const imgData = new ImageData(
                new Uint8ClampedArray(imageData.data),
                imageData.width,
                imageData.height
            );
            debugContext.putImageData(imgData, 0, 0);
        }
    }

    // Try different scales
    for (let scale = scannerSettings.minScale; scale <= scannerSettings.maxScale; scale += scannerSettings.scaleStep) {
        const scaledWidth = Math.floor(imageData.width * scale);
        const scaledHeight = Math.floor(imageData.height * scale);

        // Skip invalid dimensions
        if (scaledWidth <= 0 || scaledHeight <= 0) continue;

        // Create scaled canvas
        const scaledCanvas = document.createElement('canvas');
        scaledCanvas.width = scaledWidth;
        scaledCanvas.height = scaledHeight;
        const scaledContext = scaledCanvas.getContext('2d', { willReadFrequently: true });

        if (!scaledContext) continue;

        // Create temporary canvas with original image
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = imageData.width;
        tempCanvas.height = imageData.height;
        const tempContext = tempCanvas.getContext('2d', { willReadFrequently: true });

        if (!tempContext) continue;

        // Draw original image to temp canvas
        tempContext.putImageData(imageData, 0, 0);

        // Scale the image
        scaledContext.drawImage(tempCanvas, 0, 0, scaledWidth, scaledHeight);

        // Try scanning the entire scaled image first
        try {
            const scaledImageData = scaledContext.getImageData(0, 0, scaledWidth, scaledHeight);
            const code = jsQR(scaledImageData.data, scaledWidth, scaledHeight, {
                inversionAttempts: "dontInvert",
            });

            if (code) {
                onDecode(code.data);
                return true;
            }
        } catch (e) {
            console.error('Error scanning scaled image:', e);
        }

        // Now try with sliding windows
        for (const windowSize of scannerSettings.windowSizes) {
            const stepSize = Math.floor(windowSize * (1 - scannerSettings.windowOverlap));

            for (let y = 0; y <= scaledHeight - windowSize; y += stepSize) {
                for (let x = 0; x <= scaledWidth - windowSize; x += stepSize) {
                    // Debug visualization
                    if (debugContext && scannerSettings.debugMode) {
                        debugContext.strokeStyle = 'rgba(255, 0, 0, 0.5)';
                        debugContext.lineWidth = 2;
                        debugContext.strokeRect(
                            x / scale,
                            y / scale,
                            windowSize / scale,
                            windowSize / scale
                        );
                    }

                    try {
                        // Get the window image data
                        const windowData = scaledContext.getImageData(x, y, windowSize, windowSize);

                        // Attempt to find QR code in this window
                        const code = jsQR(windowData.data, windowSize, windowSize, {
                            inversionAttempts: "dontInvert",
                        });

                        if (code) {
                            onDecode(code.data);

                            // Highlight successful detection in debug view
                            if (debugContext && scannerSettings.debugMode) {
                                debugContext.strokeStyle = 'rgba(0, 255, 0, 1)';
                                debugContext.lineWidth = 3;
                                debugContext.strokeRect(
                                    x / scale,
                                    y / scale,
                                    windowSize / scale,
                                    windowSize / scale
                                );

                                // Convert debug canvas to data URL and set it for display
                                onDebugImage(debugCanvasRef.current?.toDataURL() || null);
                            }

                            return true;
                        }
                    } catch (e) {
                        console.error('Error scanning window:', e);
                    }
                }
            }
        }
    }

    // If debug mode is on and we got here, show the debug image anyway to help diagnose issues
    if (debugContext && scannerSettings.debugMode && debugCanvasRef.current) {
        onDebugImage(debugCanvasRef.current.toDataURL());
    }

    return false;
}; 