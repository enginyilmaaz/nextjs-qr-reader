'use client';

import React, { useState, useRef, useCallback, ChangeEvent, ClipboardEvent, useEffect } from 'react';
import jsQR from 'jsqr';
import {
  Container,
  Typography,
  Button,
  Box,
  Paper,
  TextField,
  CircularProgress,
  Snackbar,
  Alert,
  IconButton,
  LinearProgress,
  Slider,
  FormControlLabel,
  Switch,
  Divider,
  Tooltip
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import SettingsIcon from '@mui/icons-material/Settings';
import NoteAddIcon from '@mui/icons-material/NoteAdd';
import dynamic from 'next/dynamic';

// Define types for better code clarity
type DecodedDataType = 'text' | 'url' | 'wifi' | 'json' | null;
interface WifiCredentials {
  ssid: string;
  type: string;
  password?: string;
  encryptionType?: string;
}
interface PdfProcessingState {
  processing: boolean;
  message: string;
  currentPage: number;
  totalPages: number;
}

// Define types (add pdfjs type for state)
type PdfjsLibType = typeof import('pdfjs-dist');

// New interface for scanner settings
interface ScannerSettings {
  useAdvancedScanning: boolean;
  debugMode: boolean;
  minScale: number;
  maxScale: number;
  scaleStep: number;
  windowOverlap: number;
  windowSizes: number[];
}

// Helper function to parse WIFI string
const parseWifiString = (data: string): WifiCredentials | null => {
  if (!data.startsWith('WIFI:')) {
    return null;
  }
  const fields = data.substring(5).split(';');
  const credentials: Partial<WifiCredentials> = {};
  let ssidFound = false;

  fields.forEach(field => {
    if (field.startsWith('S:')) {
      credentials.ssid = field.substring(2);
      ssidFound = true;
    } else if (field.startsWith('T:')) {
      credentials.type = field.substring(2);
    } else if (field.startsWith('P:')) {
      credentials.password = field.substring(2);
    } else if (field === '') {
      // Ignore empty fields
    }
  });

  if (ssidFound && credentials.ssid) {
    if (!credentials.type) credentials.type = 'nopass';
    return credentials as WifiCredentials;
  }

  return null;
};

export default function QrReaderPage() {
  const [decodedData, setDecodedData] = useState<string | null>(null);
  const [dataType, setDataType] = useState<DecodedDataType>(null);
  const [wifiCredentials, setWifiCredentials] = useState<WifiCredentials | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [pdfProcessingState, setPdfProcessingState] = useState<PdfProcessingState>({ processing: false, message: '', currentPage: 0, totalPages: 0 });
  const [snackbarOpen, setSnackbarOpen] = useState<boolean>(false);
  const [snackbarMessage, setSnackbarMessage] = useState<string>('');
  const [pdfjs, setPdfjs] = useState<PdfjsLibType | null>(null);

  // New state variables for advanced scanning options
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

  const isUrl = (text: string): boolean => {
    try {
      new URL(text);
      return true;
    } catch {
      return false;
    }
  };

  const copyToClipboard = (text: string | undefined, message: string) => {
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => {
          setSnackbarMessage(message);
          setSnackbarOpen(true);
        })
        .catch(err => {
          console.error('Failed to copy:', err);
          setError('Failed to copy to clipboard.');
        });
    } else {
      setError('Clipboard copying is not supported or permission denied.');
      console.warn('Clipboard API not available.');
    }
  };

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

  // Advanced scanning function with sliding window technique
  const scanWithSlidingWindow = useCallback((imageData: ImageData): boolean => {
    if (!jsQR) return false;

    // Original size attempt
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "dontInvert",
    });

    if (code) {
      handleDecode(code.data);
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
          handleDecode(code.data);
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
                handleDecode(code.data);

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
                  setDebugImage(debugCanvasRef.current?.toDataURL() || null);
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
      setDebugImage(debugCanvasRef.current.toDataURL());
    }

    return false;
  }, [handleDecode, scannerSettings]);

  // Modified processImageFile to use advanced scanning
  const processImageFile = useCallback((imageSource: string) => {
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
        const found = scanWithSlidingWindow(imageData);

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
  }, [scanWithSlidingWindow]);

  // Update processPdf to use advanced scanning
  const processPdf = useCallback(async (file: File) => {
    // Check if pdfjs is loaded
    if (!pdfjs) {
      setError('PDF processing library not loaded yet. Please try again in a moment.');
      return;
    }

    setDebugImage(null); // Clear any previous debug image
    setError(null);
    setDecodedData(null);
    setDataType(null);
    setWifiCredentials(null);
    setPdfProcessingState({ processing: true, message: 'Reading PDF...', currentPage: 0, totalPages: 0 });
    setIsLoading(true);

    const reader = new FileReader();

    reader.onload = async (e) => {
      if (e.target?.result && e.target.result instanceof ArrayBuffer) {
        const pdfData = new Uint8Array(e.target.result);
        const loadingTask = pdfjs.getDocument({ data: pdfData });

        try {
          const pdf = await loadingTask.promise;
          setPdfProcessingState(prev => ({ ...prev, message: 'Processing pages...', totalPages: pdf.numPages }));

          let qrFound = false;
          for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            setPdfProcessingState(prev => ({ ...prev, message: `Processing page ${pageNum} of ${pdf.numPages}`, currentPage: pageNum }));

            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale: 2.5 }); // Use higher resolution for PDF pages
            const canvas = canvasRef.current;
            const context = canvas?.getContext('2d');

            if (!canvas || !context) {
              setError('Could not prepare canvas.');
              qrFound = false;
              break;
            }

            canvas.height = viewport.height;
            canvas.width = viewport.width;

            const renderContext = {
              canvasContext: context,
              viewport: viewport,
            };
            await page.render(renderContext).promise;

            // Now try to decode QR from this page's canvas
            try {
              const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

              // Use advanced scanning for PDF pages
              if (scanWithSlidingWindow(imageData)) {
                qrFound = true;
                break; // Stop loop if QR code is found
              }
            } catch (renderError) {
              console.error(`Error getting image data for page ${pageNum}:`, renderError);
              setError(`Error processing page ${pageNum}.`);
              // Continue to next page potentially?
            }
          }

          if (!qrFound) {
            setError('No QR code found in the PDF.');
          }

        } catch (pdfError: unknown) {
          console.error('Error loading/parsing PDF:', pdfError);
          // Type check before accessing properties
          if (pdfError instanceof Error) {
            setError(pdfError.message || 'Could not read PDF file.');
          } else {
            setError('An unknown error occurred while reading the PDF.');
          }
        }
      } else {
        setError('Could not read PDF file data.');
      }
      setPdfProcessingState({ processing: false, message: '', currentPage: 0, totalPages: 0 });
      setIsLoading(false);
    };

    reader.onerror = () => {
      setError('An error occurred while reading the file.');
      setPdfProcessingState({ processing: false, message: '', currentPage: 0, totalPages: 0 });
      setIsLoading(false);
    };

    reader.readAsArrayBuffer(file);

  }, [pdfjs, scanWithSlidingWindow]);

  // Handler for advanced options changes
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
      processPdf(file);
    } else if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result && typeof e.target.result === 'string') {
          processImageFile(e.target.result); // Use the renamed function
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
              processImageFile(e.target.result);
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
    // setError('Please paste an image.'); // Optionally inform if non-image is pasted
  }, [processImageFile]); // Updated dependency

  const handleSnackbarClose = (event?: React.SyntheticEvent | Event, reason?: string) => {
    if (reason === 'clickaway') {
      return;
    }
    setSnackbarOpen(false);
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
          <Box sx={{ width: '100%', mb: 2, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
            <Typography variant="subtitle2" gutterBottom>
              Advanced Scanning Options
            </Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={scannerSettings.useAdvancedScanning}
                  onChange={(e) => handleSettingChange('useAdvancedScanning', e.target.checked)}
                />
              }
              label="Use advanced multi-scale scanning"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={scannerSettings.debugMode}
                  onChange={(e) => handleSettingChange('debugMode', e.target.checked)}
                />
              }
              label="Debug mode (show scanning windows)"
            />
            <Divider sx={{ my: 1 }} />
            <Typography variant="body2" gutterBottom>
              Min scale: {scannerSettings.minScale}
            </Typography>
            <Slider
              value={scannerSettings.minScale}
              min={0.1}
              max={1.0}
              step={0.1}
              onChange={(_, value) => handleSettingChange('minScale', value as number)}
              disabled={!scannerSettings.useAdvancedScanning}
            />
            <Typography variant="body2" gutterBottom>
              Max scale: {scannerSettings.maxScale}
            </Typography>
            <Slider
              value={scannerSettings.maxScale}
              min={1.0}
              max={4.0}
              step={0.5}
              onChange={(_, value) => handleSettingChange('maxScale', value as number)}
              disabled={!scannerSettings.useAdvancedScanning}
            />
          </Box>
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
          <Box sx={{ width: '100%', my: 2, p: 1, border: '1px dashed', borderColor: 'grey.400', borderRadius: 1 }}>
            <Typography variant="caption" color="text.secondary" gutterBottom>
              Debug View: Green rectangle indicates found QR code, red rectangles show scanning windows
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1, overflow: 'auto' }}>
              <img
                src={debugImage}
                alt="Debug visualization"
                style={{ maxWidth: '100%', maxHeight: '400px', objectFit: 'contain' }}
              />
            </Box>
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ width: '100%', mt: 2 }}>
            {error}
          </Alert>
        )}

        {decodedData && (
          <Box sx={{ mt: 3, width: '100%', borderTop: '1px solid', borderColor: 'divider', pt: 3 }}>
            <Typography variant="h6" gutterBottom>
              Decoded Data:
            </Typography>
            <TextField
              multiline
              fullWidth
              variant="outlined"
              value={decodedData}
              InputProps={{
                readOnly: true,
              }}
              sx={{ mb: 1 }}
            />

            {/* Action Buttons */}
            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, mb: 2 }}>
              <Button
                variant="outlined"
                startIcon={<ContentCopyIcon />}
                onClick={() => copyToClipboard(decodedData, 'Data copied to clipboard!')}
              >
                Copy
              </Button>
              {dataType === 'url' && (
                <Button
                  variant="contained"
                  color="secondary"
                  href={decodedData}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Go to Link (*)
                </Button>
              )}
            </Box>

            {/* WiFi Specific Info */}
            {dataType === 'wifi' && wifiCredentials && (
              <Box sx={{ mt: 2, p: 2, border: '1px solid', borderColor: 'grey.300', borderRadius: 1 }}>
                <Typography variant="subtitle1" gutterBottom>WiFi Information:</Typography>
                <Typography><b>SSID:</b> {wifiCredentials.ssid}</Typography>
                <Typography><b>Encryption:</b> {wifiCredentials.type}</Typography>
                {wifiCredentials.password && (
                  <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                    <Typography sx={{ mr: 1 }}><b>Password:</b> {wifiCredentials.password}</Typography>
                    <IconButton
                      size="small"
                      onClick={() => copyToClipboard(wifiCredentials.password, 'WiFi password copied!')}
                      title="Copy Password"
                    >
                      <ContentCopyIcon fontSize="small" />
                    </IconButton>
                  </Box>
                )}
                <Alert severity="info" sx={{ mt: 2 }}>
                  Automatic connection is not supported. Please connect to the network manually.
                </Alert>
              </Box>
            )}
          </Box>
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
}
