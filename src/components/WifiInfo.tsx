'use client';

import React from 'react';
import {
    Box,
    Typography,
    IconButton,
    Alert
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { WifiCredentials } from '../types';

interface WifiInfoProps {
    wifiCredentials: WifiCredentials;
    onCopyPassword: (password: string) => void;
}

const WifiInfo: React.FC<WifiInfoProps> = ({
    wifiCredentials,
    onCopyPassword
}) => {
    return (
        <Box sx={{ mt: 2, p: 2, border: '1px solid', borderColor: 'grey.300', borderRadius: 1 }}>
            <Typography variant="subtitle1" gutterBottom>WiFi Information:</Typography>
            <Typography><b>SSID:</b> {wifiCredentials.ssid}</Typography>
            <Typography><b>Encryption:</b> {wifiCredentials.type}</Typography>
            {wifiCredentials.password && (
                <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                    <Typography sx={{ mr: 1 }}><b>Password:</b> {wifiCredentials.password}</Typography>
                    <IconButton
                        size="small"
                        onClick={() => onCopyPassword(wifiCredentials.password || '')}
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
    );
};

export default WifiInfo; 