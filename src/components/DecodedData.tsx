'use client';

import React from 'react';
import {
    Box,
    Typography,
    TextField,
    Button
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { DecodedDataType } from '../types';

interface DecodedDataProps {
    data: string;
    dataType: DecodedDataType;
    onCopy: () => void;
}

const DecodedData: React.FC<DecodedDataProps> = ({
    data,
    dataType,
    onCopy
}) => {
    return (
        <Box sx={{ mt: 3, width: '100%', borderTop: '1px solid', borderColor: 'divider', pt: 3 }}>
            <Typography variant="h6" gutterBottom>
                Decoded Data:
            </Typography>
            <TextField
                multiline
                fullWidth
                variant="outlined"
                value={data}
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
                    onClick={onCopy}
                >
                    Copy
                </Button>
                {dataType === 'url' && (
                    <Button
                        variant="contained"
                        color="secondary"
                        href={data}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        Go to Link (*)
                    </Button>
                )}
            </Box>
        </Box>
    );
};

export default DecodedData; 