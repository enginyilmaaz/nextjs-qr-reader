import { WifiCredentials } from '../types';

// Helper function to parse WIFI string
export const parseWifiString = (data: string): WifiCredentials | null => {
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