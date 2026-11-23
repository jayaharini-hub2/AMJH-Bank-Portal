import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CssBaseline, ThemeProvider } from '@mui/material';
import '@fontsource-variable/inter';
import LiveBank from './LiveBank';
import bank from './bank-config';
import { makeTheme } from './theme';
import { readStorage, saveStorage } from './live-api';

document.title = bank.name + ' | Account portal';
const switchUrl = 'https://sriramtpsiog.github.io/SharedDB/';
const modeKey = 'bank-ui-mode';

function Root() {
  const [mode, setMode] = useState(() => readStorage(localStorage, modeKey,
    window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  const theme = useMemo(() => makeTheme(mode, bank.color), [mode]);
  const toggle = () => { const next = mode === 'dark' ? 'light' : 'dark'; saveStorage(localStorage, modeKey, next); setMode(next); };
  return <ThemeProvider theme={theme}><CssBaseline />
    <LiveBank bank={bank} switchUrl={switchUrl} mode={mode} toggleMode={toggle} /></ThemeProvider>;
}
createRoot(document.getElementById('root')).render(<Root />);
