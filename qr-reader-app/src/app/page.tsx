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
  Link,
} from '@mui/material';

export default function QrReaderPage() {
  const [decodedData, setDecodedData] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [snackbarOpen, setSnackbarOpen] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const isUrl = (text: string): boolean => {
    try {
      new URL(text);
      return true;
    } catch (_) {
      return false;
    }
  };

  const handleDecode = useCallback((imageData: ImageData) => {
    setIsLoading(true);
    setError(null);
    setDecodedData(null);

    try {
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert',
      });

      if (code && code.data) {
        setDecodedData(code.data);
        navigator.clipboard.writeText(code.data)
          .then(() => {
            setSnackbarOpen(true);
          })
          .catch(err => {
            console.error('Failed to copy to clipboard:', err);
            setError('QR code çözüldü ancak panoya kopyalanamadı.');
          });
      } else {
        setError('QR kodu bulunamadı veya okunamadı.');
      }
    } catch (err) {
      console.error('Decoding error:', err);
      setError('QR kodu çözülürken bir hata oluştu.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const processImage = useCallback((imageSource: string) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d', { willReadFrequently: true }); // willReadFrequently for performance
    if (!canvas || !context) {
      setError('Canvas hazırlanamadı.');
      return;
    }

    const img = new Image();
    img.onload = () => {
      // Adjust canvas size to image size for accurate decoding
      canvas.width = img.width;
      canvas.height = img.height;
      context.drawImage(img, 0, 0, img.width, img.height);
      try {
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        handleDecode(imageData);
      } catch (e) {
        // Handle potential security errors when reading canvas data (e.g., tainted canvas)
        console.error("Error getting ImageData:", e);
        setError("Resim verisi okunurken bir güvenlik hatası oluştu. Farklı bir resim deneyin.");
        setIsLoading(false);
      }
    };
    img.onerror = () => {
      setError('Resim yüklenemedi.');
      setIsLoading(false);
    };
    img.src = imageSource;
    setIsLoading(true); // Show loading indicator while image loads
  }, [handleDecode]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result && typeof e.target.result === 'string') {
          processImage(e.target.result);
        } else {
          setError('Dosya okunamadı.');
        }
      };
      reader.onerror = () => {
        setError('Dosya okunurken bir hata oluştu.');
      }
      reader.readAsDataURL(file);
    }
    // Reset file input value to allow selecting the same file again
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
              setError('Yapıştırılan resim okunamadı.');
            }
          };
          reader.onerror = () => {
            setError('Yapıştırılan resim okunurken bir hata oluştu.');
          }
          reader.readAsDataURL(blob);
          event.preventDefault(); // Prevent default paste action only if an image is found
          return; // Process only the first image found
        }
      }
    }
    // Optional: Provide feedback if non-image content is pasted
    // setError('Lütfen bir resim yapıştırın.');
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
        onPaste={handlePaste} // Listen for paste events on the main container
      >
        <Typography variant="h5" component="h1" gutterBottom>
          QR Kod Okuyucu
        </Typography>

        <Typography variant="body1" align="center" sx={{ mb: 2 }}>
          Bir QR kodu yükleyin veya doğrudan buraya yapıştırın.
        </Typography>

        <Button
          variant="contained"
          component="label" // Make button act as a label for the hidden file input
          disabled={isLoading}
          sx={{ mb: 2 }}
        >
          Dosya Yükle
          <input
            type="file"
            accept="image/*"
            hidden
            ref={fileInputRef}
            onChange={handleFileChange}
            disabled={isLoading}
          />
        </Button>

        {/* Hidden canvas for image processing */}
        <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>

        {isLoading && <CircularProgress sx={{ my: 2 }} />}

        {error && (
          <Alert severity="error" sx={{ width: '100%', mt: 2 }}>
            {error}
          </Alert>
        )}

        {decodedData && (
          <Box sx={{ mt: 3, width: '100%' }}>
            <Typography variant="h6" gutterBottom>
              Çözülen Veri:
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
            {isUrl(decodedData) && (
              <Button
                variant="contained"
                color="secondary"
                href={decodedData}
                target="_blank" // Open link in a new tab
                rel="noopener noreferrer" // Security best practice
                fullWidth
              >
                Linke Git (*)
              </Button>
            )}
          </Box>
        )}
        <Typography variant="caption" align="center" sx={{ mt: 2, fontStyle: 'italic', color: 'text.secondary' }}>
          İpucu: QR kodu içeren bir resmi kopyalayıp bu alana yapıştırabilirsiniz (Ctrl+V veya Cmd+V).
        </Typography>
      </Paper>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={handleSnackbarClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleSnackbarClose} severity="success" sx={{ width: '100%' }}>
          Panoya kopyalandı!
        </Alert>
      </Snackbar>
    </Container>
  );
}
