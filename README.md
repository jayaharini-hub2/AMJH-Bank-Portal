# Bank portal template

Register the bank with the SharedBank operator. Set its bank ID, name, IFSC and branding in `src/bank-config.js`. Set the common HTTPS Worker URL in `src/cloudflare-config.js`, or set the repository variable `VITE_X42_API_URL`.

On Node.js 22 or newer, run `npm ci` and `npm run dev` to work locally. The portal uses the bank's Firebase test account and displays live synthetic balances from the Worker.

Publish this folder to a GitHub repository and enable its GitHub Pages source with **GitHub Actions**. The supplied workflow deploys the `main` branch.

## UI (Material UI)

The portal uses React + Material UI only (`@mui/material`, `@mui/icons-material`). The theme is in `src/theme.js` and takes its primary colour from `bank-config.js`. Pages: Overview, Send money (details → review → receipt), Transactions (search, filters, pagination, CSV export, receipt), Bank directory, Profile. Light and dark modes are supported.

## Scope

The portal talks only to the common Worker endpoints (`sign-in`, `dashboard`, `transfers`, `/directory/banks`). It does not write to the shared database. Customer registration with KYC, admin approval and emails, loans, beneficiaries and limit management need a bank-owned backend that is not part of this patch.
