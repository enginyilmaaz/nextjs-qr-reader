'use client';

import React, { useState, useRef, useCallback, ChangeEvent, ClipboardEvent, useEffect } from 'react';
import {
    Container,
    Typography,
    Button,
    Box,
    Paper,
    CircularProgress,
    Snackbar,
    Alert,
    Tooltip,
    LinearProgress
} from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import NoteAddIcon from '@mui/icons-material/NoteAdd';

import { DecodedDataType, PdfProcessingState, PdfjsLibType, ScannerSettings, WifiCredentials } from '../types';
import { parseWifiString } from '../utils/wifiParser';
import { copyToClipboard } from '../utils/clipboardHelper';
import { processImageFile } from '../utils/imageProcessor';
import { processPdf } from '../utils/pdfProcessor';

// Import components
import AdvancedOptions from './AdvancedOptions';
import WifiInfo from './WifiInfo';
import DecodedData from './DecodedData';
import DebugView from './DebugView';

const QRReader: React.FC = () => {
    const [decodedData, setDecodedData] = useState<string | null>(null);
    const [dataType, setDataType] = useState<DecodedDataType>(null);
    const [wifiCredentials, setWifiCredentials] = useState<WifiCredentials | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [pdfProcessingState, setPdfProcessingState] = useState<PdfProcessingState>({
        processing: false, message: '', currentPage: 0, totalPages: 0
    });
    const [snackbarOpen, setSnackbarOpen] = useState<boolean>(false);
    const [snackbarMessage, setSnackbarMessage] = useState<string>('');
    const [pdfjs, setPdfjs] = useState<PdfjsLibType | null>(null);

    // Advanced settings state
    const [showAdvancedOptions, setShowAdvancedOptions] = useState<boolean>(false);
    const [scannerSettings, setScannerSettings] = useState<ScannerSettings>({
        useAdvancedScanning: true, // Enable by default
        debugMode: false,
        minScale: 0.5,
        maxScale: 2.0,
        scaleStep: 0.25,
        windowOverlap: 0.25, // 25% overlap between sliding windows
        windowSizes: [300, 500] // Window sizes to use for sliding window
    });
    const [debugImage, setDebugImage] = useState<string | null>(null); // For debug visualization

    const fileInputRef = useRef<HTMLInputElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const debugCanvasRef = useRef<HTMLCanvasElement>(null); // For debug visualization
    const pdfWorkerSrc = `/pdf.worker.min.mjs`;

    // Effect to dynamically load pdfjs-dist
    useEffect(() => {
        import('pdfjs-dist').then(pdfjsDist => {
            setPdfjs(pdfjsDist);
        }).catch(error => {
            console.error("Failed to load pdfjs-dist:", error);
            setError("Could not load PDF processing library.");
        });
    }, []);

    // Effect to set worker source once pdfjs is loaded
    useEffect(() => {
        if (pdfjs) { // Check if pdfjs is loaded
            pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
        }
    }, [pdfjs, pdfWorkerSrc]); // Depend on pdfjs state

    // Handle decoded QR code data
    const handleDecode = (data: string) => {
        setDecodedData(data);

        // Try parsing as JSON
        try {
            const jsonData = JSON.parse(data);
            setDataType('json');
            // Extract WiFi credentials if it contains wifi fields
            if (jsonData.ssid && jsonData.password) {
                setWifiCredentials({
                    ssid: jsonData.ssid,
                    password: jsonData.password,
                    type: jsonData.type || "WPA",
                    encryptionType: jsonData.encryptionType || "WPA"
                });
            }
        } catch (error) {
            setDataType(null);

            // Check if it's a wifi credential string
            if (data.startsWith('WIFI:')) {
                setDataType('wifi');
                // Parse wifi credentials
                const ssidMatch = data.match(/S:(.*?);/);
                const passwordMatch = data.match(/P:(.*?);/);
                const typeMatch = data.match(/T:(.*?);/);

                if (ssidMatch && passwordMatch) {
                    setWifiCredentials({
                        ssid: ssidMatch[1],
                        password: passwordMatch[1],
                        type: typeMatch ? typeMatch[1] : "WPA",
                        encryptionType: typeMatch ? typeMatch[1] : "WPA"
                    });
                }
            }
            // Check if it's a URL
            else if (data.startsWith('http://') || data.startsWith('https://')) {
                setDataType('url');
            }
            // Default to text
            else {
                setDataType('text');
            }
        }
    };

    // Handle setting change
    const handleSettingChange = (setting: keyof ScannerSettings, value: any) => {
        setScannerSettings(prev => ({
            ...prev,
            [setting]: value
        }));
    };

    // Toggle advanced options panel
    const toggleAdvancedOptions = () => {
        setShowAdvancedOptions(!showAdvancedOptions);
    };

    const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        // Reset previous state
        setError(null);
        setDecodedData(null);
        setDataType(null);
        setWifiCredentials(null);
        setPdfProcessingState({ processing: false, message: '', currentPage: 0, totalPages: 0 });

        if (file.type === 'application/pdf') {
            processPdf(
                file,
                pdfjs,
                canvasRef,
                debugCanvasRef,
                scannerSettings,
                setDebugImage,
                setError,
                setDecodedData,
                setDataType,
                setWifiCredentials,
                setPdfProcessingState,
                setIsLoading,
                handleDecode
            );
        } else if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                if (e.target?.result && typeof e.target.result === 'string') {
                    processImageFile(
                        e.target.result,
                        scannerSettings,
                        debugCanvasRef,
                        setIsLoading,
                        setError,
                        setDebugImage,
                        handleDecode
                    );
                } else {
                    setError('Could not read image file.');
                }
            };
            reader.onerror = () => {
                setError('An error occurred while reading the image file.');
            }
            reader.readAsDataURL(file);
        } else {
            setError('Unsupported file type. Please upload an image or a PDF.');
        }

        // Reset file input value
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handlePaste = useCallback((event: ClipboardEvent<HTMLDivElement>) => {
        // Reset state before processing paste
        setError(null);
        setDecodedData(null);
        setDataType(null);
        setWifiCredentials(null);
        setPdfProcessingState({ processing: false, message: '', currentPage: 0, totalPages: 0 });

        const items = event.clipboardData?.items;
        if (!items) return;

        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const blob = items[i].getAsFile();
                if (blob) {
                    // Read blob as Data URL for processImageFile
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        if (e.target?.result && typeof e.target.result === 'string') {
                            processImageFile(
                                e.target.result,
                                scannerSettings,
                                debugCanvasRef,
                                setIsLoading,
                                setError,
                                setDebugImage,
                                handleDecode
                            );
                        } else {
                            setError('Could not read pasted image.');
                        }
                    };
                    reader.onerror = () => {
                        setError('An error occurred while reading the pasted image.');
                    }
                    reader.readAsDataURL(blob);
                    event.preventDefault();
                    return;
                }
            }
        }
    }, [scannerSettings]);

    const handleSnackbarClose = (event?: React.SyntheticEvent | Event, reason?: string) => {
        if (reason === 'clickaway') {
            return;
        }
        setSnackbarOpen(false);
    };

    const handleCopy = () => {
        copyToClipboard(
            decodedData || '',
            (message) => {
                setSnackbarMessage(message);
                setSnackbarOpen(true);
            },
            (errorMsg) => setError(errorMsg)
        );
    };

    const handleCopyPassword = (password: string) => {
        copyToClipboard(
            password,
            (message) => {
                setSnackbarMessage('WiFi password copied!');
                setSnackbarOpen(true);
            },
            (errorMsg) => setError(errorMsg)
        );
    };

    return (
        <Container maxWidth="md" sx={{ mt: 4 }}>
            <Paper
                elevation={3}
                sx={{ p: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}
                onPaste={handlePaste}
            >
                <Typography variant="h5" component="h1" gutterBottom>
                    QR Code Reader
                </Typography>

                <Typography variant="body1" align="center" sx={{ mb: 2 }}>
                    Upload a QR code image or PDF, or paste an image directly here.
                </Typography>

                <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                    <Button
                        variant="contained"
                        component="label"
                        disabled={isLoading}
                    >
                        Upload File
                        <input
                            type="file"
                            accept="image/*,.pdf"
                            hidden
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            disabled={isLoading}
                        />
                    </Button>
                </Box>

                <Tooltip title="Advanced scanning options">
                    <Button
                        variant="outlined"
                        onClick={toggleAdvancedOptions}
                        startIcon={<SettingsIcon />}
                        endIcon={<NoteAddIcon />}
                        disabled={isLoading}
                        sx={{ position: 'absolute', top: 16, right: 16 }}
                    >
                        Options
                    </Button>
                </Tooltip>

                {/* Advanced options panel */}
                {showAdvancedOptions && (
                    <AdvancedOptions
                        scannerSettings={scannerSettings}
                        onSettingChange={handleSettingChange}
                    />
                )}

                {/* Hidden canvases for image processing */}
                <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
                <canvas ref={debugCanvasRef} style={{ display: 'none' }}></canvas>

                {/* Loading Indicators */}
                {isLoading && !pdfProcessingState.processing && <CircularProgress sx={{ my: 2 }} />}
                {pdfProcessingState.processing && (
                    <Box sx={{ width: '100%', my: 2 }}>
                        <Typography variant="body2" align="center" sx={{ mb: 1 }}>{pdfProcessingState.message}</Typography>
                        {pdfProcessingState.totalPages > 0 && (
                            <LinearProgress variant="determinate" value={(pdfProcessingState.currentPage / pdfProcessingState.totalPages) * 100} />
                        )}
                        {!pdfProcessingState.totalPages && <LinearProgress />}
                    </Box>
                )}

                {/* Debug image display */}
                {scannerSettings.debugMode && debugImage && (
                    <DebugView debugImage={debugImage} />
                )}

                {error && (
                    <Alert severity="error" sx={{ width: '100%', mt: 2 }}>
                        {error}
                    </Alert>
                )}

                {decodedData && (
                    <>
                        <DecodedData
                            data={decodedData}
                            dataType={dataType}
                            onCopy={handleCopy}
                        />

                        {/* WiFi Specific Info */}
                        {dataType === 'wifi' && wifiCredentials && (
                            <WifiInfo
                                wifiCredentials={wifiCredentials}
                                onCopyPassword={handleCopyPassword}
                            />
                        )}
                    </>
                )}

                <Typography variant="caption" align="center" sx={{ mt: 2, fontStyle: 'italic', color: 'text.secondary' }}>
                    Tip: You can copy an image containing a QR code and paste it here (Ctrl+V or Cmd+V).
                </Typography>
            </Paper>

            <Snackbar
                open={snackbarOpen}
                autoHideDuration={3000}
                onClose={handleSnackbarClose}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert onClose={handleSnackbarClose} severity="success" sx={{ width: '100%' }}>
                    {snackbarMessage}
                </Alert>
            </Snackbar>
        </Container>
    );
};

export default QRReader; 