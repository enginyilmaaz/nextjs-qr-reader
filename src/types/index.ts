// Define types for better code clarity
export type DecodedDataType = 'text' | 'url' | 'wifi' | 'json' | null;

export interface WifiCredentials {
    ssid: string;
    type: string;
    password?: string;
    encryptionType?: string;
}

export interface PdfProcessingState {
    processing: boolean;
    message: string;
    currentPage: number;
    totalPages: number;
}

// Define types (add pdfjs type for state)
export type PdfjsLibType = typeof import('pdfjs-dist');

// Interface for scanner settings
export interface ScannerSettings {
    useAdvancedScanning: boolean;
    debugMode: boolean;
    minScale: number;
    maxScale: number;
    scaleStep: number;
    windowOverlap: number;
    windowSizes: number[];
} 