// Check if a string is a valid URL
export const isUrl = (text: string): boolean => {
    try {
        new URL(text);
        return true;
    } catch {
        return false;
    }
}; 