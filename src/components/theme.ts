'use client';
import { Roboto } from 'next/font/google';
import { createTheme } from '@mui/material/styles';

const roboto = Roboto({
    weight: ['300', '400', '500', '700'],
    subsets: ['latin'],
    display: 'swap',
});

const theme = createTheme({
    typography: {
        fontFamily: roboto.style.fontFamily,
    },
    // You can add other theme customizations here
    // palette: {
    //   mode: 'light',
    //   primary: { main: '#1976d2' },
    //   secondary: { main: '#dc004e' },
    // },
});

export default theme; 