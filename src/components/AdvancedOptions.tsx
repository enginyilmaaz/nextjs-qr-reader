'use client';

import React from 'react';
import {
    Box,
    Typography,
    FormControlLabel,
    Switch,
    Divider,
    Slider
} from '@mui/material';
import { ScannerSettings } from '../types';

interface AdvancedOptionsProps {
    scannerSettings: ScannerSettings;
    onSettingChange: (setting: keyof ScannerSettings, value: number | boolean) => void;
}

const AdvancedOptions: React.FC<AdvancedOptionsProps> = ({
    scannerSettings,
    onSettingChange
}) => {
    return (
        <Box sx={{ width: '100%', mb: 2, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
            <Typography variant="subtitle2" gutterBottom>
                Advanced Scanning Options
            </Typography>
            <FormControlLabel
                control={
                    <Switch
                        checked={scannerSettings.useAdvancedScanning}
                        onChange={(e) => onSettingChange('useAdvancedScanning', e.target.checked)}
                    />
                }
                label="Use advanced multi-scale scanning"
            />
            <FormControlLabel
                control={
                    <Switch
                        checked={scannerSettings.debugMode}
                        onChange={(e) => onSettingChange('debugMode', e.target.checked)}
                    />
                }
                label="Debug mode (show scanning windows)"
            />
            <Divider sx={{ my: 1 }} />
            <Typography variant="body2" gutterBottom>
                Min scale: {scannerSettings.minScale}
            </Typography>
            <Slider
                value={scannerSettings.minScale}
                min={0.1}
                max={1.0}
                step={0.1}
                onChange={(_, value) => onSettingChange('minScale', value as number)}
                disabled={!scannerSettings.useAdvancedScanning}
            />
            <Typography variant="body2" gutterBottom>
                Max scale: {scannerSettings.maxScale}
            </Typography>
            <Slider
                value={scannerSettings.maxScale}
                min={1.0}
                max={4.0}
                step={0.5}
                onChange={(_, value) => onSettingChange('maxScale', value as number)}
                disabled={!scannerSettings.useAdvancedScanning}
            />
        </Box>
    );
};

export default AdvancedOptions; 