'use client';

import React, { useState, useRef, useCallback, ChangeEvent, ClipboardEvent } from 'react';
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
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';

// Define types for better code clarity
type DecodedDataType = 'text' | 'url' | 'wifi' | null;
interface WifiCredentials {
  ssid: string;
  type: string;
  password?: string;
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
  const [snackbarOpen, setSnackbarOpen] = useState<boolean>(false);
  const [snackbarMessage, setSnackbarMessage] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

  const handleDecode = useCallback((imageData: ImageData) => {
    setIsLoading(true);
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
        setDecodedData(data);

        const parsedWifi = parseWifiString(data);
        if (parsedWifi) {
          setDataType('wifi');
          setWifiCredentials(parsedWifi);
        } else if (isUrl(data)) {
          setDataType('url');
        } else {
          setDataType('text');
        }
      } else {
        setError('QR code not found or could not be read.');
      }
    } catch (err) {
      console.error('Decoding error:', err);
      setError('An error occurred while decoding the QR code.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const processImage = useCallback((imageSource: string) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d', { willReadFrequently: true });
    if (!canvas || !context) {
      setError('Could not prepare canvas.');
      return;
    }

    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      context.drawImage(img, 0, 0, img.width, img.height);
      try {
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        handleDecode(imageData);
      } catch (e) {
        console.error("Error getting ImageData:", e);
        setError("A security error occurred while reading image data. Try a different image.");
        setIsLoading(false);
      }
    };
    img.onerror = () => {
      setError('Could not load image.');
      setIsLoading(false);
    };
    img.src = imageSource;
    setIsLoading(true);
  }, [handleDecode]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result && typeof e.target.result === 'string') {
          processImage(e.target.result);
        } else {
          setError('Could not read file.');
        }
      };
      reader.onerror = () => {
        setError('An error occurred while reading the file.');
      }
      reader.readAsDataURL(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handlePaste = useCallback((event: ClipboardEvent<HTMLDivElement>) => {
    const items = event.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const blob = items[i].getAsFile();
        if (blob) {
          const reader = new FileReader();
          reader.onload = (e) => {
            if (e.target?.result && typeof e.target.result === 'string') {
              processImage(e.target.result);
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
  }, [processImage]);

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
          Upload a QR code image or paste it directly here.
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
            accept="image/*"
            hidden
            ref={fileInputRef}
            onChange={handleFileChange}
            disabled={isLoading}
          />
        </Button>

        <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>

        {isLoading && <CircularProgress sx={{ my: 2 }} />}

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
