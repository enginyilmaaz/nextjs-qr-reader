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
  LinearProgress
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import * as pdfjsLib from 'pdfjs-dist';

// Define types for better code clarity
type DecodedDataType = 'text' | 'url' | 'wifi' | null;
interface WifiCredentials {
  ssid: string;
  type: string;
  password?: string;
}
interface PdfProcessingState {
  processing: boolean;
  message: string;
  currentPage: number;
  totalPages: number;
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfWorkerSrc = `/pdf.worker.min.mjs`; // Path to worker file in public folder

  useEffect(() => {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
  }, [pdfWorkerSrc]);

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

  const handleDecode = useCallback((imageData: ImageData): boolean => {
    // Reset previous results before attempting decode
    setError(null);
    setDecodedData(null);
    setDataType(null);
    setWifiCredentials(null);

    try {
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert',
      });

      if (code && code.data) {
        const data = code.data;
        setDecodedData(data); // Set data immediately

        const parsedWifi = parseWifiString(data);
        if (parsedWifi) {
          setDataType('wifi');
          setWifiCredentials(parsedWifi);
        } else if (isUrl(data)) {
          setDataType('url');
        } else {
          setDataType('text');
        }
        // Found a QR code, return true to stop PDF processing
        return true;
      } else {
        // No QR code found on this canvas/page
        // setError('QR code not found or could not be read.'); // Don't set error here, let PDF loop finish
        return false;
      }
    } catch (err) {
      console.error('Decoding error:', err);
      setError('An error occurred while decoding the QR code.');
      return false; // Indicate failure
    }
    // Note: We removed the finally block setting isLoading=false from here
    // It will be handled by the calling function (processImage/processPdf)
  }, []); // Ensure dependencies are correct

  // Processes a single image file
  const processImageFile = useCallback((imageSource: string) => {
    setIsLoading(true); // Set loading true for image processing
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d', { willReadFrequently: true });
    if (!canvas || !context) {
      setError('Could not prepare canvas.');
      setIsLoading(false);
      return;
    }

    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      context.drawImage(img, 0, 0, img.width, img.height);
      try {
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const found = handleDecode(imageData);
        if (!found) {
          setError('No QR code found in the image.');
        }
      } catch (e) {
        console.error("Error getting ImageData:", e);
        setError("A security error occurred while reading image data. Try a different image.");
      }
      setIsLoading(false); // Set loading false after processing
    };
    img.onerror = () => {
      setError('Could not load image.');
      setIsLoading(false);
    };
    img.src = imageSource;
  }, [handleDecode]);

  // Processes a PDF file, page by page
  const processPdf = useCallback(async (file: File) => {
    setError(null);
    setDecodedData(null);
    setDataType(null);
    setWifiCredentials(null);
    setPdfProcessingState({ processing: true, message: 'Reading PDF...', currentPage: 0, totalPages: 0 });
    setIsLoading(true); // Use general loading indicator as well

    const reader = new FileReader();

    reader.onload = async (e) => {
      if (e.target?.result && e.target.result instanceof ArrayBuffer) {
        const pdfData = new Uint8Array(e.target.result);
        const loadingTask = pdfjsLib.getDocument({ data: pdfData });

        try {
          const pdf = await loadingTask.promise;
          setPdfProcessingState(prev => ({ ...prev, message: 'Processing pages...', totalPages: pdf.numPages }));

          let qrFound = false;
          for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            setPdfProcessingState(prev => ({ ...prev, message: `Processing page ${pageNum} of ${pdf.numPages}`, currentPage: pageNum }));

            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale: 1.5 }); // Adjust scale as needed
            const canvas = canvasRef.current;
            const context = canvas?.getContext('2d');

            if (!canvas || !context) {
              setError('Could not prepare canvas.');
              qrFound = false; // Stop processing if canvas fails
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
              if (handleDecode(imageData)) {
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

  }, [handleDecode]); // Add handleDecode dependency

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
    <Container maxWidth="sm" sx={{ mt: 4 }}>
      <Paper
        elevation={3}
        sx={{ p: 3, display: 'flex', flexDirection: 'column', alignItems: 'center' }}
        onPaste={handlePaste}
      >
        <Typography variant="h5" component="h1" gutterBottom>
          QR Code Reader
        </Typography>

        <Typography variant="body1" align="center" sx={{ mb: 2 }}>
          Upload a QR code image or PDF, or paste an image directly here.
        </Typography>

        <Button
          variant="contained"
          component="label"
          disabled={isLoading}
          sx={{ mb: 2 }}
        >
          Upload File
          <input
            type="file"
            accept="image/*,.pdf" // Updated accept attribute
            hidden
            ref={fileInputRef}
            onChange={handleFileChange}
            disabled={isLoading}
          />
        </Button>

        <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>

        {/* Loading Indicators */}
        {isLoading && !pdfProcessingState.processing && <CircularProgress sx={{ my: 2 }} />}
        {pdfProcessingState.processing && (
          <Box sx={{ width: '100%', my: 2 }}>
            <Typography variant="body2" align="center" sx={{ mb: 1 }}>{pdfProcessingState.message}</Typography>
            {pdfProcessingState.totalPages > 0 && (
              <LinearProgress variant="determinate" value={(pdfProcessingState.currentPage / pdfProcessingState.totalPages) * 100} />
            )}
            {!pdfProcessingState.totalPages && <LinearProgress />} {/* Indeterminate for initial loading */}
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
