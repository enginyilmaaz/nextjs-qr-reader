'use client';

import { scanWithSlidingWindow } from './qrScanner';
import { PdfjsLibType, PdfProcessingState, ScannerSettings } from '../types';

export const processPdf = async (
    file: File,
    pdfjs: PdfjsLibType | null,
    canvasRef: React.RefObject<HTMLCanvasElement>,
    debugCanvasRef: React.RefObject<HTMLCanvasElement>,
    scannerSettings: ScannerSettings,
    setDebugImage: (image: string | null) => void,
    setError: (error: string | null) => void,
    setDecodedData: (data: string | null) => void,
    setDataType: (type: any) => void,
    setWifiCredentials: (credentials: any) => void,
    setPdfProcessingState: (state: PdfProcessingState) => void,
    setIsLoading: (loading: boolean) => void,
    onDecode: (data: string) => void
) => {
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
                setPdfProcessingState({ message: 'Processing pages...', processing: true, currentPage: 0, totalPages: pdf.numPages });

                let qrFound = false;
                for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                    setPdfProcessingState({ message: `Processing page ${pageNum} of ${pdf.numPages}`, processing: true, currentPage: pageNum, totalPages: pdf.numPages });

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
                        if (scanWithSlidingWindow(
                            imageData,
                            scannerSettings,
                            debugCanvasRef,
                            setDebugImage,
                            onDecode
                        )) {
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
}; 