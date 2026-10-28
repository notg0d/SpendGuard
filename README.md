# SubSense

Subscription renewal decisions with context. Built for freelancers and creators
for the Tatum × Walrus Total Recall hackathon (Consumer Finance Apps).

SubSense tracks manually entered subscriptions, calculates recurring USD
commitments, and remembers why you kept, downgraded, or planned to cancel a
service. A deterministic recommendation engine compares usage-only advice with
your latest applicable feedback. Sign in with a Sui wallet, unlock your encrypted
credential vault, and optionally connect your own MemWal Mainnet account and OpenAI
API key. AI can explain decisions, plan renewals and semantically search selected
context. No bank connection, automatic cancellation, or autonomous payment is involved.

## Run locally

Use **Node.js 24 LTS** (required for the TypeScript workspace tests) and npm.

```sh
npm ci
npm run setup:mainnet
npm run dev
```

Open **http://localhost:3000**. Express and Vite share one process and one port.
Connect a Sui Mainnet wallet and sign the one-time personal login message. This is
not a transaction and costs no gas. Connections opens first to set up your vault.
New workspaces start empty; sample loading has been removed. Existing saved data
is preserved; **Settings → Start my own workspace** explicitly replaces it after
confirmation. Browser storage is the only local
persistence; export a backup before clearing browser data.

```sh
npm run check
```

Runs TypeScript checking, domain/integration/workspace/network-isolation tests, a production
build, and an isolated production HTTP smoke test. Tests use mocks or local HTTP
servers, not live blockchain requests or uploads.

For built-asset serving:

```sh
npm run build
npm start
```

The same Express entry point serves `dist/` and `/api/subsense/*` on port 3000.
Unlike `npm run dev`, this does not expose Vite development filesystem/editor
routes. Set `PORT` in the server environment if needed. The original AI Builder
preview continues using the inline Vite middleware configuration.

## Wallet login and Mainnet connections

Wallet login is required. Local subscription tracking works after sign-in even
without provider credentials. **All new provider operations are Mainnet only.**
Follow [the Mainnet setup and verification guide](docs/MAINNET.md).

1. Connect the Sui wallet that owns your **Mainnet MemWal account** and sign in.
2. In Connections enter your Mainnet Tatum API key, MemWal account object ID, and
   an already registered **Ed25519 delegate** private key. Never enter your wallet
   seed phrase or owner wallet private key.
3. Set a separate, strong vault password (at least 12 characters). The app checks
   account ownership, deployment, activation, delegate registration and signed
   metadata access, then saves only encrypted ciphertext in this browser.
4. Lock providers or sign out when finished. Reconnect with the vault password;
   it is not sent to the server and cannot be recovered. Export an encrypted vault
   backup separately from your workspace backup.

| Variable                                           | Purpose                                                                             |
| -------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `SUBSENSE_NETWORK`                                 | `mainnet` (default); wallet server rejects other networks                           |
| `SUBSENSE_PUBLIC_ORIGIN`                           | Exact app origin, default `http://localhost:3000`; HTTPS required outside localhost |
| `TATUM_API_KEY`, `MEMWAL_KEY`, `MEMWAL_ACCOUNT_ID` | Optional server-only diagnostic credentials, **never reused by wallet sessions**    |

`npm run setup:mainnet` creates `.env` only if absent; it never overwrites existing
credentials. Set the exact public origin before hosting or using a different local
port/hostname, then restart. No trailing slash/path is allowed. POST origins must
match exactly. **Never use `VITE_*` variables for secrets or commit credentials.**
Old Testnet credentials do not become Mainnet credentials by changing a setting.

`npm run test:connections` identifies wallet mode and directs you to the browser;
it cannot access your HttpOnly login cookie. `npm run diagnose:walrus` is a
separate read-only diagnostic using local `.env`, not your browser vault/session.

### Walrus Memory

1. Use your own Mainnet Walrus Memory account and authorised delegate.
   See [SDK usage](https://docs.wal.app/walrus-memory/sdk/usage/memwal) and
   [public relayer](https://docs.wal.app/walrus-memory/relayer/public-relayer).
2. Start a non-sample workspace; save a renewal decision with a meaningful reason.
3. In the journal, choose **Upload to Walrus**, review the privacy notice, and
   explicitly confirm. One click submits one decision; there is no batch or
   automatic upload.
4. An accepted job is **pending**, not stored. Use **Check upload status** until
   the SDK returns `done` and a `blob_id`.
5. Recall relevant decisions in Connections. Validated records enter the same
   learning engine. Different workspace profile IDs use different namespaces.

If a request times out, recall before retrying. Submission uses a profile-scoped
idempotency key based on the decision ID. Keep a reported recovery job ID if the
browser cannot save its receipt. Relayer health proves reachability only, not
delegate/account access or completed writes. Semantic recall returns at most 50
relevant results; it is not an exhaustive memory inventory.

### Tatum Sui payment evidence

Connections can verify an **existing** native SUI transaction for a manually
selected service. It checks the exact transaction digest, execution success,
complete balance changes, recipient's exact net SUI increase, UTC payment date,
and optional sender. Amounts use integer MIST rather than floating point.

Connections also offers a read-only native SUI balance check once the vault is
connected. The server uses Mainnet's HTTP GraphQL interface advertised by Tatum gateway
discovery. Its query was checked against the installed Sui GraphQL schema and
tested with mocked responses; **authenticated live compatibility remains
unverified**. Missing data, pagination, errors, and mismatches fail closed.
Verification is not proof that a vendor recognised a bill. Replay detection is
limited to this browser workspace. USD budgeting is separate from native SUI
payment evidence. No funds are sent.

### OpenAI assistant and semantic search

Add an OpenAI API key in Connections (use **Replace credentials** for an existing
vault, re-entering all credentials you want to retain). The key is encrypted in
the same vault, never stored in workspace backups or reused from `.env`. You can
leave all Mainnet provider fields empty for AI-only setup; wallet sign-in is still
required. Setup checks `/v1/models` for chat and embedding access, not paid inference.

In **AI assistant**, choose Ask, Explain, Plan renewals or Semantic search, select
up to 100 records, enter a question and confirm consent for each request. Only
selected validated subscription/decision context goes to OpenAI. AI advice also
includes the planning budget and deterministic totals/rules for the selected
subset. Recall MemWal decisions explicitly in Connections to make them selectable.
Wallet addresses, keys, payment evidence and remote receipts are not AI context.

The backend uses pinned `https://api.openai.com/v1/responses` with `store:false`
and structured, tool-free output; embeddings use `text-embedding-3-small` (256
dimensions). The default chat model is `gpt-4.1-mini`; `gpt-4.1` and `gpt-5-mini`
are selectable subject to project access. No retries or automatic requests.
Each session allows one AI request at a time and up to 12 per minute. Embeddings
are cached in that wallet session only and cleared on lock/sign-out/expiry. AI
results/chat are not persisted. Budget rules are unchanged and work without AI.

OpenAI may charge for questions and search; set project spending limits and check
usage. `store:false` is not a zero-retention guarantee: OpenAI's own data policies
apply. Similarity and source references are not verified proof. Advice can be wrong
and never changes subscriptions or performs payments. Live OpenAI compatibility
and billing have not been verified with a real user key; automated tests use mocks.

## Product and privacy boundaries

- Prices, usage, provider status, and renewal dates are entered by the user.
  Paused/cancelled services do not count toward active commitments. Record
  cancellation only after confirming it with the provider.
- A decision does not change the service's status, date, price, or budget.
  User-declared essential protection is never silently removed. Latest matching
  service feedback applies for 180 days; a monthly-equivalent price increase over
  10% prompts a fresh review. Future/unrelated records are ignored.
- Subscriptions, decisions, preferences, and evidence are wallet-scoped browser-local
  data, **not encrypted**. A wallet scope is not protection against other people or
  scripts with access to the same browser. The
  preview has no durable runtime filesystem or database. `/tmp` is ephemeral.
- Corrupt saved data is not overwritten automatically. Settings offers raw
  recovery export and explicit replacement. Imports preserve the profile ID but
  strip Testnet/Mainnet receipts and payment evidence; recall/reverification must restore
  remote provenance. Backups contain sensitive financial notes: keep them private.
- Explicit memory uploads send service, price, decision, and rationale to the
  relayer. It processes plaintext for embedding/encryption; stored blobs are
  encrypted. Do not upload secrets or private client details. Use synthetic data
  for public demonstrations.
- Credential vaults use AES-256-GCM with PBKDF2-SHA-256 (600,000 iterations), fresh
  salt/IV, and wallet/network-bound authentication. Only ciphertext is persisted.
  Unlocking sends provider keys to the app backend over HTTPS (localhost may use
  HTTP) for a 30-minute in-memory session. The vault password never leaves the
  browser. Encryption protects keys at rest, not against malicious scripts or
  extensions while unlocked. There is no password recovery or cross-device sync.
- Wallet personal-message signatures authenticate short-lived HttpOnly,
  SameSite=Strict sessions (Secure on HTTPS). Per-user keys/clients are isolated;
  lock, logout, expiry and server restart remove backend credentials. This has
  regression coverage, not an independent production security audit.
- Historical Testnet receipts keep their original label and never count as
  Mainnet evidence. Settings can explicitly import the old browser workspace;
  the original legacy storage is not modified.

## Verification and release status

See [verification notes](docs/VERIFICATION.md),
[development plan](docs/DEVELOPMENT_PLAN.md), and
[demo/submission checklist](docs/DEMO.md).

The refined UI follows the [UI refinement plan](docs/UI_REFINEMENT_PLAN.md),
using composition research from Uniswap, Aave and Zerion with the existing Tatum
tokens. It includes a financial summary, live category breakdown, compact service
inventory, decision evidence, and keyboard-accessible mobile navigation.

Local functionality is implemented and tested. A historical Tatum Testnet health
query succeeded, but authenticated Mainnet wallet/provider access, live Mainnet
write/recall, hosted deployment, and hackathon submission remain unverified.
Sample decisions never count toward Mainnet eligibility. The UI counts
unique locally confirmed blob IDs, not an account-wide total.

`npm audit` currently reports **4 vulnerabilities (3 moderate, 1 high)** in the
inherited Vite/esbuild and Express/qs dependency trees. Non-breaking audit fixes
were applied; no forced major upgrades were made. Serve built assets for public
demos, keep development private, and resolve remaining dependency findings before
production release. The API uses JSON-only bodies, a simple query parser, a 32 KB
body limit, wallet-signed sessions, origin checks, fixed upstream URLs, and secret redaction;
these are not substitutes for dependency maintenance.

## Reference attribution

This repository began from the friend's SpendGuard scaffold. The original UI is
retained in `src/SpendGuardReference.tsx`; original service and route source is
also retained for provenance. They are not mounted in SubSense. In particular,
legacy mock Walrus receipts and arbitrary proxy routes are not served.

**Before publishing:** confirm the original author's reuse permission, add their
preferred name/link and licence attribution, and verify third-party licence
requirements. SubSense's domain engine, workspace, UI flows, and integration
adapters are new work; the reference is not represented as genuine Mainnet proof.
