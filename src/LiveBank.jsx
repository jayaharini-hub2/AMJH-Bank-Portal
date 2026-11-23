import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, AppBar, Avatar, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, Drawer, IconButton, List, ListItemButton, ListItemIcon, ListItemText, MenuItem, Skeleton, Snackbar,
  Stack, Step, StepLabel, Stepper, Table, TableBody, TableCell, TableContainer, TableHead, TablePagination,
  TableRow, TextField, ToggleButton, ToggleButtonGroup, Toolbar, Tooltip, Typography, useMediaQuery,
} from '@mui/material';
import {
  AccountBalance, CheckCircle, DarkMode, Domain, FileDownload, History, LightMode, Logout, Menu as MenuIcon,
  PersonOutline, Public, Refresh, Send, SpaceDashboard, SwapHoriz,
} from '@mui/icons-material';
import { toPaise } from './amount';
import { money, time, downloadCsv } from './format';
import { configuredEndpoint, liveApi, parseEndpoint, readStorage, saveStorage } from './live-api';

const statusNames = { PENDING: 'Pending', PROCESSING: 'Processing', COMPLETED: 'Completed', REJECTED: 'Rejected', MANUAL_REVIEW: 'Manual review' };
const statusColor = { COMPLETED: 'success', PENDING: 'warning', PROCESSING: 'info', REJECTED: 'error', MANUAL_REVIEW: 'warning' };
const rejectionNames = {
  INSUFFICIENT_FUNDS: 'Insufficient available balance', LIMIT_EXCEEDED: 'Transfer limit exceeded',
  DESTINATION_ACCOUNT_UNAVAILABLE: 'The destination is unavailable',
};
const byId = (directory, id) => directory.find(b => b.bankId === id)?.bankName || id;
const StatusChip = ({ status }) => <Chip size="small" color={statusColor[status] || 'default'} label={statusNames[status] || status} />;
const views = [['overview', 'Overview', <SpaceDashboard />], ['transfer', 'Send money', <SwapHoriz />],
  ['history', 'Transactions', <History />], ['banks', 'Bank directory', <Domain />], ['profile', 'Profile', <PersonOutline />]];

function TransferTable({ rows, directory, onOpen }) {
  if (!rows.length) return <Box sx={{ p: 5, textAlign: 'center' }}><SwapHoriz color="disabled" sx={{ fontSize: 40 }} />
    <Typography fontWeight={700}>No transfers found</Typography>
    <Typography variant="body2" color="text.secondary">Transfers appear here when the Worker accepts them.</Typography></Box>;
  return <TableContainer><Table size="small">
    <TableHead><TableRow><TableCell>Transfer</TableCell><TableCell>Route</TableCell><TableCell align="right">Amount</TableCell><TableCell>Status</TableCell></TableRow></TableHead>
    <TableBody>{rows.map(row => <TableRow hover key={row.transferId} onClick={() => onOpen(row)} sx={{ cursor: 'pointer' }}>
      <TableCell><Typography variant="body2" fontWeight={650}>{row.transferId}</Typography><Typography variant="caption" color="text.secondary">{time(row.createdAt)}</Typography></TableCell>
      <TableCell><Typography variant="body2" fontWeight={600}>{byId(directory, row.sourceBankId)} → {byId(directory, row.destinationBankId)}</Typography>
        <Typography variant="caption" color="text.secondary">{row.type === 'INTERNAL' ? 'Same bank' : row.direction === 'CREDIT' ? 'Incoming' : 'Outgoing'}</Typography></TableCell>
      <TableCell align="right" sx={{ fontWeight: 700, color: row.direction === 'CREDIT' ? 'success.main' : 'text.primary' }}>
        {row.direction === 'CREDIT' ? '+' : '−'}{money(row.amountMinor)}</TableCell>
      <TableCell><StatusChip status={row.status} />{row.code && <Typography variant="caption" display="block" color="text.secondary">{rejectionNames[row.code] || row.code.toLowerCase().replaceAll('_', ' ')}</Typography>}</TableCell>
    </TableRow>)}</TableBody></Table></TableContainer>;
}

function ReceiptDialog({ row, directory, onClose }) {
  const lines = row ? [['Transfer ID', row.transferId], ['Date', time(row.createdAt)], ['From', byId(directory, row.sourceBankId)],
    ['To', byId(directory, row.destinationBankId)], ['Type', row.type === 'INTERNAL' ? 'Same bank' : row.direction === 'CREDIT' ? 'Incoming' : 'Outgoing'],
    ['Amount', money(row.amountMinor)], ['Reason', row.code ? (rejectionNames[row.code] || row.code) : '—']] : [];
  return <Dialog open={!!row} onClose={onClose} fullWidth maxWidth="xs"><DialogTitle>Transfer receipt</DialogTitle>
    <DialogContent dividers>{row && <><Stack alignItems="center" spacing={1} sx={{ mb: 2 }}>
      <Typography variant="h4">{money(row.amountMinor)}</Typography><StatusChip status={row.status} /></Stack>
      {lines.map(([k, v]) => <Stack key={k} direction="row" justifyContent="space-between" sx={{ py: .75 }}>
        <Typography variant="body2" color="text.secondary">{k}</Typography><Typography variant="body2" fontWeight={600} sx={{ textAlign: 'right', wordBreak: 'break-all' }}>{v}</Typography></Stack>)}</>}</DialogContent>
    <DialogActions><Button onClick={onClose}>Close</Button></DialogActions></Dialog>;
}

function Transfer({ bank, accounts, directory, send, onReceipt }) {
  const [step, setStep] = useState(0);
  const [type, setType] = useState('interbank');
  const [f, setF] = useState({ from: '', ifsc: '', number: '', amount: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const sources = accounts.filter(a => a.status === 'ACTIVE');
  const routes = directory.filter(b => b.bankId !== bank.id && b.status === 'ACTIVE');
  const from = sources.find(a => a.accountId === f.from) || sources[0];
  const route = routes.find(b => b.ifsc === f.ifsc) || routes[0];
  const ifsc = type === 'internal' ? bank.ifsc : route?.ifsc;
  const destName = type === 'internal' ? bank.name : route?.bankName;
  const amountMinor = toPaise(f.amount);
  const set = key => e => setF({ ...f, [key]: e.target.value });

  function review(e) {
    e.preventDefault();
    if (!from || !ifsc || !f.number.trim() || amountMinor === null) return setError('Choose a source, destination and a positive amount with at most two decimals.');
    if (amountMinor > from.availableMinor) return setError('The amount is more than the available balance.');
    setError(''); setStep(1);
  }
  async function confirm() {
    setBusy(true); setError('');
    try {
      const row = await send({ fromAccountId: from.accountId, destinationIfsc: ifsc,
        destinationAccountNumber: f.number.trim(), amountMinor, currency: 'INR' });
      setDone(row); setStep(2);
    } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }
  function reset() { setStep(0); setDone(null); setError(''); setF({ ...f, number: '', amount: '' }); }

  return <Card><CardContent sx={{ p: { xs: 2, sm: 3 } }}>
    <Stepper activeStep={step} alternativeLabel sx={{ mb: 3 }}>{['Details', 'Review', 'Receipt'].map(l => <Step key={l}><StepLabel>{l}</StepLabel></Step>)}</Stepper>
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    {step === 0 && <Stack component="form" spacing={2} onSubmit={review} sx={{ maxWidth: 520, mx: 'auto' }}>
      <ToggleButtonGroup exclusive fullWidth color="primary" value={type} onChange={(_, v) => v && setType(v)}>
        <ToggleButton value="interbank">Other bank</ToggleButton><ToggleButton value="internal">Same bank</ToggleButton></ToggleButtonGroup>
      <TextField select label="From account" value={from?.accountId || ''} onChange={set('from')} disabled={!sources.length}>
        {sources.map(a => <MenuItem key={a.accountId} value={a.accountId}>{a.accountNumber} · {money(a.availableMinor)} available</MenuItem>)}</TextField>
      {type === 'interbank' && <TextField select label="Destination bank" value={route?.ifsc || ''} onChange={set('ifsc')} disabled={!routes.length}
        helperText={routes.length ? '' : 'No active destination banks in the directory yet.'}>
        {routes.map(b => <MenuItem key={b.ifsc} value={b.ifsc}>{b.bankName} · {b.ifsc}</MenuItem>)}</TextField>}
      <TextField label="Destination account number" required value={f.number} onChange={set('number')} />
      <TextField label="Amount (INR)" required value={f.amount} onChange={set('amount')} placeholder="0.00" slotProps={{ htmlInput: { inputMode: 'decimal' } }} />
      <Button type="submit" variant="contained" size="large" endIcon={<Send />} disabled={!from || !ifsc}>Review transfer</Button></Stack>}
    {step === 1 && <Stack spacing={2} sx={{ maxWidth: 520, mx: 'auto' }}>
      <Typography variant="h4" textAlign="center">{money(amountMinor)}</Typography>
      {[['From', from.accountNumber], ['To bank', destName + ' · ' + ifsc], ['To account', f.number.trim()]].map(([k, v]) =>
        <Stack key={k} direction="row" justifyContent="space-between"><Typography color="text.secondary">{k}</Typography><Typography fontWeight={650}>{v}</Typography></Stack>)}
      <Alert severity="info">Retrying the same details reuses the same request ID, so a transfer is never sent twice.</Alert>
      <Stack direction="row" spacing={1}><Button fullWidth variant="outlined" disabled={busy} onClick={() => setStep(0)}>Back</Button>
        <Button fullWidth variant="contained" disabled={busy} onClick={confirm}>{busy ? 'Submitting…' : 'Confirm and send'}</Button></Stack></Stack>}
    {step === 2 && done && <Stack spacing={2} alignItems="center" sx={{ maxWidth: 520, mx: 'auto' }}>
      <CheckCircle color={done.status === 'REJECTED' ? 'error' : 'success'} sx={{ fontSize: 56 }} />
      <Typography variant="h5">{done.status === 'COMPLETED' ? 'Transfer completed' : done.status === 'REJECTED' ? 'Transfer rejected' : 'Transfer accepted'}</Typography>
      <StatusChip status={done.status} />
      <Typography color="text.secondary">{money(done.amountMinor ?? amountMinor)} · {done.transferId}</Typography>
      <Stack direction="row" spacing={1}><Button variant="outlined" onClick={() => onReceipt(done)}>View receipt</Button><Button variant="contained" onClick={reset}>New transfer</Button></Stack></Stack>}
  </CardContent></Card>;
}

function HistoryView({ rows, directory, onOpen }) {
  const [q, setQ] = useState(''); const [status, setStatus] = useState('ALL'); const [dir, setDir] = useState('ALL');
  const [page, setPage] = useState(0); const [size, setSize] = useState(10);
  const list = useMemo(() => rows.filter(r => (status === 'ALL' || r.status === status) && (dir === 'ALL' || (r.direction || 'DEBIT') === dir) &&
    (r.transferId + byId(directory, r.sourceBankId) + byId(directory, r.destinationBankId)).toLowerCase().includes(q.trim().toLowerCase())), [rows, q, status, dir, directory]);
  const exportCsv = () => downloadCsv('transactions.csv', [['Transfer ID', 'Date (IST)', 'From', 'To', 'Direction', 'Amount (INR)', 'Status'],
    ...list.map(r => [r.transferId, time(r.createdAt), byId(directory, r.sourceBankId), byId(directory, r.destinationBankId), r.direction || 'DEBIT', (r.amountMinor / 100).toFixed(2), r.status])]);
  return <Card><CardContent>
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
      <TextField size="small" label="Search" value={q} onChange={e => { setQ(e.target.value); setPage(0); }} sx={{ flex: 1 }} />
      <TextField size="small" select label="Status" value={status} onChange={e => { setStatus(e.target.value); setPage(0); }} sx={{ minWidth: 150 }}>
        <MenuItem value="ALL">All statuses</MenuItem>{Object.entries(statusNames).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}</TextField>
      <TextField size="small" select label="Direction" value={dir} onChange={e => { setDir(e.target.value); setPage(0); }} sx={{ minWidth: 150 }}>
        <MenuItem value="ALL">All</MenuItem><MenuItem value="DEBIT">Outgoing</MenuItem><MenuItem value="CREDIT">Incoming</MenuItem></TextField>
      <Button variant="outlined" startIcon={<FileDownload />} onClick={exportCsv} disabled={!list.length}>Export CSV</Button></Stack>
    <TransferTable rows={list.slice(page * size, page * size + size)} directory={directory} onOpen={onOpen} />
    <TablePagination component="div" count={list.length} page={page} onPageChange={(_, p) => setPage(p)} rowsPerPage={size}
      onRowsPerPageChange={e => { setSize(+e.target.value); setPage(0); }} rowsPerPageOptions={[5, 10, 25]} />
  </CardContent></Card>;
}

function SignIn({ bank, email, setEmail, password, setPassword, busy, onSubmit, error, children }) {
  return <Box sx={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: { md: '1.1fr 1fr' } }}>
    <Box sx={{ display: { xs: 'none', md: 'flex' }, flexDirection: 'column', justifyContent: 'center', p: 8, color: '#fff',
      background: t => `linear-gradient(145deg, #0a1633 0%, ${t.palette.primary.main} 100%)` }}>
      <AccountBalance sx={{ fontSize: 56, mb: 2 }} /><Typography variant="h3" fontWeight={800}>{bank.wordmark}</Typography>
      <Typography variant="h6" sx={{ mt: 1, opacity: .85, fontWeight: 400 }}>Simple, secure banking across the SharedBank network.</Typography>
      <Stack spacing={1} sx={{ mt: 4, opacity: .9 }}>{['Live balances and transfer activity', 'Send money to any bank in the network', 'Receipts and CSV statements'].map(t =>
        <Stack key={t} direction="row" spacing={1}><CheckCircle fontSize="small" /><Typography>{t}</Typography></Stack>)}</Stack></Box>
    <Box sx={{ display: 'grid', placeItems: 'center', p: 3 }}><Card sx={{ width: '100%', maxWidth: 420 }}><CardContent sx={{ p: 4 }}>
      <Typography variant="h5">Sign in to {bank.name}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>Use the customer login created in this bank’s Firebase project.</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {children || <Stack component="form" spacing={2} onSubmit={onSubmit}>
        <TextField label="Email" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} />
        <TextField label="Password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
        <Button type="submit" variant="contained" size="large" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button></Stack>}
    </CardContent></Card></Box></Box>;
}

export default function LiveBank({ bank, switchUrl, mode, toggleMode }) {
  const urlKey = 'x42-cloudflare-worker-url';
  const [base, setBase] = useState(() => configuredEndpoint || readStorage(localStorage, urlKey, ''));
  const [session, setSession] = useState(null);
  const prefix = '/banks/' + bank.id;
  const [url, setUrl] = useState(base);
  const [editUrl, setEditUrl] = useState(!base);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [data, setData] = useState({ accounts: [], transfers: [] });
  const [directory, setDirectory] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState('overview');
  const [menu, setMenu] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const wide = useMediaQuery(t => t.breakpoints.up('md'));
  const activeToken = useRef(null);
  activeToken.current = session?.token;
  const pending = useRef(new Map());

  const refresh = useCallback(async signal => {
    if (!session) return;
    try {
      const value = await liveApi(base, prefix + '/dashboard', { token: session.token, signal });
      if (signal?.aborted || activeToken.current !== session.token) return;
      setData(value); setLoaded(true); setError('');
    } catch (failure) {
      if (signal?.aborted || activeToken.current !== session.token) return;
      if (failure.status === 401) { setSession(null); setData({ accounts: [], transfers: [] }); setLoaded(false); }
      setError(failure.message);
    }
  }, [base, prefix, session]);

  useEffect(() => {
    if (!session) return undefined;
    const controller = new AbortController();
    const update = () => { if (document.visibilityState === 'visible') refresh(controller.signal); };
    refresh(controller.signal);
    const timer = setInterval(update, 12_000);
    document.addEventListener('visibilitychange', update);
    return () => { clearInterval(timer); controller.abort(); document.removeEventListener('visibilitychange', update); };
  }, [session, refresh]);

  useEffect(() => {
    if (!session) return undefined;
    const controller = new AbortController();
    liveApi(base, '/directory/banks', { signal: controller.signal }).then(v => setDirectory(v.banks || []))
      .catch(failure => { if (!controller.signal.aborted) setError(failure.message); });
    return () => controller.abort();
  }, [base, session]);

  function logout() { setSession(null); setLoaded(false); setData({ accounts: [], transfers: [] }); setNote(''); setView('overview'); }

  async function signIn(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { setSession(await liveApi(base, prefix + '/sign-in', { data: { email: email.trim(), password } })); }
    catch (failure) { setError(failure.message); } finally { setPassword(''); setBusy(false); }
  }

  function connect(event) {
    event.preventDefault(); setError('');
    try {
      const endpoint = parseEndpoint(url);
      if (endpoint !== base) { logout(); setDirectory([]); }
      saveStorage(localStorage, urlKey, endpoint); setBase(endpoint); setEditUrl(false);
    } catch (failure) { setError(failure.message); }
  }

  async function send(transfer) {
    const raw = JSON.stringify([bank.id, base, session.uid, transfer]);
    const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw)));
    const hash = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    const keyName = 'x42-pending-' + hash;
    const key = pending.current.get(keyName) || readStorage(sessionStorage, keyName, null) || crypto.randomUUID();
    pending.current.set(keyName, key);
    saveStorage(sessionStorage, keyName, key);
    const row = await liveApi(base, prefix + '/transfers', { token: session.token, data: transfer, key });
    pending.current.delete(keyName);
    saveStorage(sessionStorage, keyName, null);
    setNote((statusNames[row.status] || 'Accepted') + ' · ' + row.transferId);
    await refresh();
    return row;
  }

  const connectionForm = <Stack component="form" spacing={2} onSubmit={connect}>
    <TextField label="Cloudflare Worker URL" fullWidth required value={url} onChange={e => setUrl(e.target.value)} />
    <Button type="submit" variant="contained">Save connection</Button></Stack>;

  if (!session) return <SignIn bank={bank} email={email} setEmail={setEmail} password={password} setPassword={setPassword}
    busy={busy} onSubmit={signIn} error={error}>{editUrl || !base ? connectionForm : null}</SignIn>;

  const totalAvailable = data.accounts.reduce((s, a) => s + a.availableMinor, 0);
  const totalHeld = data.accounts.reduce((s, a) => s + a.heldMinor, 0);
  const goto = v => { setView(v); setMenu(false); };
  const drawer = <Box sx={{ width: 260, height: '100%', display: 'flex', flexDirection: 'column', bgcolor: '#0a1633', color: '#fff' }}>
    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ p: 2.5 }}><Avatar sx={{ bgcolor: 'primary.main' }}><AccountBalance /></Avatar>
      <Box><Typography fontWeight={800} lineHeight={1.1}>{bank.wordmark}</Typography><Typography variant="caption" sx={{ opacity: .7 }}>BANKING PORTAL</Typography></Box></Stack>
    <List sx={{ px: 1.5, flex: 1 }}>{views.map(([id, label, icon]) => <ListItemButton key={id} selected={view === id} onClick={() => goto(id)}
      sx={{ borderRadius: 2, mb: .5, '&.Mui-selected': { bgcolor: 'rgba(255,255,255,.14)' }, '&.Mui-selected:hover': { bgcolor: 'rgba(255,255,255,.2)' } }}>
      <ListItemIcon sx={{ color: 'inherit', minWidth: 40 }}>{icon}</ListItemIcon><ListItemText primary={label} /></ListItemButton>)}</List>
    <Divider sx={{ borderColor: 'rgba(255,255,255,.15)' }} />
    <List sx={{ px: 1.5 }}><ListItemButton component="a" href={switchUrl} sx={{ borderRadius: 2 }}><ListItemIcon sx={{ color: 'inherit', minWidth: 40 }}><Public /></ListItemIcon><ListItemText primary="SharedBank switch" /></ListItemButton>
      <ListItemButton onClick={logout} sx={{ borderRadius: 2 }}><ListItemIcon sx={{ color: 'inherit', minWidth: 40 }}><Logout /></ListItemIcon><ListItemText primary="Sign out" /></ListItemButton></List></Box>;

  const stats = [['Total available', money(totalAvailable)], ['Held', money(totalHeld)], ['Accounts', data.accounts.length], ['Transfers', data.transfers.length]];
  const title = views.find(v => v[0] === view)[1];

  return <Box sx={{ display: 'flex', minHeight: '100vh' }}>
    {wide ? <Drawer variant="permanent" sx={{ width: 260, '& .MuiDrawer-paper': { width: 260, border: 0 } }}>{drawer}</Drawer>
      : <Drawer open={menu} onClose={() => setMenu(false)} sx={{ '& .MuiDrawer-paper': { border: 0 } }}>{drawer}</Drawer>}
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <AppBar position="sticky" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}><Toolbar>
        {!wide && <IconButton edge="start" onClick={() => setMenu(true)} aria-label="Open menu"><MenuIcon /></IconButton>}
        <Typography fontWeight={700} sx={{ flex: 1, ml: wide ? 0 : 1 }}>{bank.name} · {bank.id}</Typography>
        <Chip size="small" label="Test network" color="warning" variant="outlined" sx={{ mr: 1 }} />
        <Tooltip title="Refresh"><IconButton onClick={() => refresh()}><Refresh /></IconButton></Tooltip>
        <Tooltip title="Toggle theme"><IconButton onClick={toggleMode}>{mode === 'dark' ? <LightMode /> : <DarkMode />}</IconButton></Tooltip>
        <Avatar sx={{ width: 34, height: 34, ml: 1, bgcolor: 'primary.main', fontSize: 15 }}>{(session.email || '?')[0].toUpperCase()}</Avatar></Toolbar></AppBar>
      <Box component="main" sx={{ p: { xs: 2, md: 4 }, maxWidth: 1100, mx: 'auto' }}>
        <Typography variant="h4" sx={{ mb: .5 }}>{title}</Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>Signed in as {session.email}</Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
        {loaded && !data.accounts.length && <Alert severity="info" sx={{ mb: 2 }}>This Firebase user has no synthetic account in this bank. Attach an account to this Firebase UID.</Alert>}
        {view === 'overview' && <Stack spacing={3}>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' } }}>{stats.map(([k, v]) => <Card key={k}><CardContent>
            <Typography variant="body2" color="text.secondary">{k}</Typography>{loaded ? <Typography variant="h5">{v}</Typography> : <Skeleton width="70%" height={36} />}</CardContent></Card>)}</Box>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' } }}>
            {!loaded && <Skeleton variant="rounded" height={150} />}
            {data.accounts.map((a, i) => <Card key={a.accountId} sx={{ color: i === 0 ? '#fff' : 'inherit', border: 0,
              background: t => i === 0 ? `linear-gradient(135deg, #0a1633, ${t.palette.primary.main})` : t.palette.background.paper }}><CardContent>
              <Stack direction="row" justifyContent="space-between"><Typography>{a.label} · {a.accountNumber}</Typography><AccountBalance /></Stack>
              <Typography variant="h4" sx={{ my: 2 }}>{money(a.availableMinor)}</Typography>
              <Typography variant="body2" sx={{ opacity: .8 }}>Available · Held {money(a.heldMinor)} · {a.status}</Typography></CardContent></Card>)}</Box>
          <Card><CardContent><Stack direction="row" justifyContent="space-between" alignItems="center"><Typography variant="h6">Recent transfers</Typography>
            <Stack direction="row" spacing={1}><Button startIcon={<Send />} variant="contained" onClick={() => goto('transfer')} disabled={!data.accounts.length}>Send money</Button>
              <Button onClick={() => goto('history')}>View all</Button></Stack></Stack>
            <TransferTable rows={data.transfers.slice(0, 5)} directory={directory} onOpen={setReceipt} /></CardContent></Card></Stack>}
        {view === 'transfer' && (data.accounts.length ? <Transfer bank={bank} accounts={data.accounts} directory={directory} send={send} onReceipt={setReceipt} />
          : <Alert severity="info">No account available to send from.</Alert>)}
        {view === 'history' && <HistoryView rows={data.transfers} directory={directory} onOpen={setReceipt} />}
        {view === 'banks' && <Card><TableContainer><Table><TableHead><TableRow><TableCell>Bank</TableCell><TableCell>Bank ID</TableCell><TableCell>IFSC</TableCell><TableCell>Status</TableCell></TableRow></TableHead>
          <TableBody>{directory.map(b => <TableRow key={b.bankId} selected={b.bankId === bank.id}><TableCell sx={{ fontWeight: 650 }}>{b.bankName}</TableCell><TableCell>{b.bankId}</TableCell>
            <TableCell>{b.ifsc}</TableCell><TableCell><Chip size="small" color={b.status === 'ACTIVE' ? 'success' : 'default'} label={b.status} /></TableCell></TableRow>)}</TableBody></Table></TableContainer>
          {!directory.length && <Box sx={{ p: 4, textAlign: 'center' }}><Typography color="text.secondary">Loading the bank directory…</Typography></Box>}</Card>}
        {view === 'profile' && <Card><CardContent><Stack spacing={1.5} sx={{ maxWidth: 560 }}>
          {[['Email', session.email], ['Firebase UID', session.uid], ['Bank', bank.name], ['Bank ID', bank.id], ['IFSC', bank.ifsc]].map(([k, v]) =>
            <Stack key={k} direction="row" justifyContent="space-between" spacing={2}><Typography color="text.secondary">{k}</Typography><Typography fontWeight={600} sx={{ wordBreak: 'break-all', textAlign: 'right' }}>{v}</Typography></Stack>)}
          {!configuredEndpoint && <><Divider />{editUrl ? connectionForm : <Button variant="outlined" onClick={() => { setUrl(base); setEditUrl(true); }}>Change Worker connection</Button>}</>}</Stack></CardContent></Card>}
      </Box></Box>
    <ReceiptDialog row={receipt} directory={directory} onClose={() => setReceipt(null)} />
    <Snackbar open={!!note} autoHideDuration={6000} onClose={() => setNote('')} message={note} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
  </Box>;
}
