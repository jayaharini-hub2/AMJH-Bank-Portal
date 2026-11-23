import { createTheme } from '@mui/material';

export const makeTheme = (mode, color) => createTheme({
  palette: {
    mode,
    primary: { main: color },
    secondary: { main: '#0f9d8a' },
    background: mode === 'dark' ? { default: '#0b1220', paper: '#121a2b' } : { default: '#f3f5fa', paper: '#ffffff' },
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: '"Inter Variable", Inter, sans-serif',
    h4: { fontWeight: 750 }, h5: { fontWeight: 700 }, h6: { fontWeight: 700 },
    button: { textTransform: 'none', fontWeight: 650 },
  },
  components: {
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiCard: { defaultProps: { variant: 'outlined' } },
    MuiTableCell: { styleOverrides: { head: { fontWeight: 700, whiteSpace: 'nowrap' } } },
    MuiChip: { styleOverrides: { root: { fontWeight: 650 } } },
  },
});
