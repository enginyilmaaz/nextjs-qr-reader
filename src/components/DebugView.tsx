'use client';

import React from 'react';
import {
    Box,
    Typography
} from '@mui/material';

interface DebugViewProps {
    debugImage: string;
}

const DebugView: React.FC<DebugViewProps> = ({ debugImage }) => {
    return (
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
    );
};

export default DebugView; 