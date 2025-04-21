import { DecodedDataType, WifiCredentials } from '../types';

interface HandleDecodeResult {
    decodedData: string;
    dataType: DecodedDataType;
    wifiCredentials: WifiCredentials | null;
}

export const handleDecode = (data: string): HandleDecodeResult => {
    // Try parsing as JSON
    try {
        const jsonData = JSON.parse(data);

        // Extract WiFi credentials if it contains wifi fields
        if (jsonData.ssid && jsonData.password) {
            return {
                decodedData: data,
                dataType: 'json',
                wifiCredentials: {
                    ssid: jsonData.ssid,
                    password: jsonData.password,
                    type: jsonData.type || "WPA",
                    encryptionType: jsonData.encryptionType || "WPA"
                }
            };
        }

        return {
            decodedData: data,
            dataType: 'json',
            wifiCredentials: null
        };
    } catch (error) {
        // Check if it's a wifi credential string
        if (data.startsWith('WIFI:')) {
            // Parse wifi credentials
            const ssidMatch = data.match(/S:(.*?);/);
            const passwordMatch = data.match(/P:(.*?);/);
            const typeMatch = data.match(/T:(.*?);/);

            if (ssidMatch && passwordMatch) {
                return {
                    decodedData: data,
                    dataType: 'wifi',
                    wifiCredentials: {
                        ssid: ssidMatch[1],
                        password: passwordMatch[1],
                        type: typeMatch ? typeMatch[1] : "WPA",
                        encryptionType: typeMatch ? typeMatch[1] : "WPA"
                    }
                };
            }

            return {
                decodedData: data,
                dataType: 'wifi',
                wifiCredentials: null
            };
        }
        // Check if it's a URL
        else if (data.startsWith('http://') || data.startsWith('https://')) {
            return {
                decodedData: data,
                dataType: 'url',
                wifiCredentials: null
            };
        }
        // Default to text
        else {
            return {
                decodedData: data,
                dataType: 'text',
                wifiCredentials: null
            };
        }
    }
}; 