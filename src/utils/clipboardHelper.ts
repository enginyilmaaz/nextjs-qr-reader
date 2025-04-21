// Helper function to copy text to clipboard
export const copyToClipboard = (
    text: string | undefined,
    onSuccess: (message: string) => void,
    onError: (message: string) => void
): void => {
    if (!text) return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
            .then(() => {
                onSuccess('Data copied to clipboard!');
            })
            .catch(err => {
                console.error('Failed to copy:', err);
                onError('Failed to copy to clipboard.');
            });
    } else {
        onError('Clipboard copying is not supported or permission denied.');
        console.warn('Clipboard API not available.');
    }
}; 