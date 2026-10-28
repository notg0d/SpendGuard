# Wallet-first Mainnet setup

## Start and sign in

Use Node.js 24 LTS. Run `npm ci`, `npm run setup:mainnet`, then `npm run dev`.
Open <http://localhost:3000>, connect an installed Sui wallet (for example Slush),
then **Sign in with wallet**. Wallet connection alone is not authentication:
the server verifies a one-time personal-message signature bound to the wallet,
origin, nonce, expiry and `sui:mainnet`. Login is not a transaction or transfer.

For another hostname/port or hosting, set `SUBSENSE_PUBLIC_ORIGIN` to that exact
origin before restarting, such as `https://your-app.example`. It must have no
path, trailing slash or embedded credentials. HTTPS is mandatory outside
localhost. Do not expose the Vite development server publicly; build and serve
with `npm run build` and `npm start`.

## Add your API credentials

Connections opens first. For Walrus/Tatum you need all three below. Free AI via OpenRouter is
optional and can be configured independently; see [AI setup](AI.md).

- Your own **Mainnet-scoped Tatum key** with Sui GraphQL access, from
  <https://dashboard.tatum.io>.
- An existing **Mainnet MemWal account object ID**, not an owner/delegate wallet
  address or a relayer registry/package ID.
- The **Ed25519 delegate private key registered on that account**, in supported
  hex-seed or `suiprivkey` format. Never enter an owner wallet key or seed phrase.

The connected wallet must own the account. If you do not have an account or a
registered delegate, follow the [official MemWal account guide](https://docs.wal.app/walrus-memory/sdk/usage/memwal)
and [delegate management guide](https://github.com/MystenLabs/MemWal/blob/dev/docs/contract/delegate-key-management.md),
explicitly choosing Mainnet. These owner-controlled on-chain operations may need
SUI gas; SubSense does not create accounts, register delegates or pay for them.
Never submit a private key in a registration field that asks for a public key.

Choose a unique, strong vault password of 12–256 characters and confirm it.
**Save encrypted vault & connect** makes read-only deployment/account checks
through Tatum and one signed MemWal metadata request. It does not upload memories.
Only after verification succeeds does it persist encrypted credentials. Failed
replacement/restoration leaves the previous saved vault intact. Storage failure
after verification clears the backend connection rather than silently continuing.

Mainnet endpoints are pinned to `https://sui-mainnet.gateway.tatum.io/graphql`
and `https://relayer.memory.walrus.xyz`. There is no Testnet fallback. Existing
`.env` provider keys are only for separate diagnostics; runtime wallet requests
never borrow shared server credentials.

## Vault and session safety

- AES-256-GCM, PBKDF2-SHA-256 with 600,000 iterations, fresh salt/IV, and
  authenticated wallet/network binding protect saved ciphertext.
- The password remains in the browser and cannot be recovered. Decrypted keys
  are sent only to this app's backend, then the appropriate pinned provider.
- Backend sessions expire after 30 minutes. HttpOnly cookies use SameSite=Strict,
  Secure on HTTPS, and wallet-header matching. Lock, sign-out, expiry and restart
  clear backend keys. Switching wallets requires the matching wallet login/vault.
- **Lock vault & disconnect providers** preserves saved ciphertext.
  **Forget saved vault** removes it from this browser and clears providers, but
  does not revoke the delegate on-chain or delete remote memories.
- Export an encrypted vault separately. Restore it using the same wallet and
  password; failed unlock/verification does not replace the saved copy.
- No server-side durable storage or cross-device sync is available in the preview.
  Workspace notes remain unencrypted browser data, not part of the credential vault.
  Browser scripts/extensions can access unlocked secrets: use trusted hosting and
  a private browser profile. This is not a production security audit.

## Verify without transferring funds

1. In Connections, save/unlock the vault and confirm the verified Mainnet badge.
2. Use **Refresh & test connections**, then **Read SUI balance** for a Mainnet
   address. Empty accounts may legitimately have zero; malformed data fails closed.
3. In Settings start your own workspace, add a synthetic service and meaningful
   renewal decision. Confirm recommendations change with your stated context.
4. Only if you explicitly accept external processing and possible costs, upload
   one decision in the journal. Accepted jobs are pending. Check status until
   `done` plus a real blob ID confirms Mainnet storage, then recall it.
5. Verify an **existing** Mainnet native SUI transaction by digest, recipient,
   exact net SUI increase, UTC date and optional sender. The app sends no funds and
   cannot prove vendor recognition of a bill. USD budgeting stays separate.
6. Export the workspace and encrypted vault separately. Sign out, reconnect,
   unlock, and verify recall with the same account/profile. Recall is bounded to
   50 relevant results, not an exhaustive memory inventory.

Historical Testnet receipts remain labelled Testnet, never Mainnet proof. Import
strips remote receipts/payment evidence; recall/reverification must re-establish
provenance. **Import previous browser workspace** copies the legacy data only after
confirmation and does not alter its original storage.

## Troubleshooting

| Symptom                              | Action                                                                                    |
| ------------------------------------ | ----------------------------------------------------------------------------------------- |
| No wallet found                      | Install/update a Sui wallet extension and refresh                                         |
| Signature rejected                   | Connect the intended Mainnet account; request and sign a fresh challenge                  |
| Origin rejected (403)                | Open exactly `SUBSENSE_PUBLIC_ORIGIN`; correct the setting and restart                    |
| Session expired (401)                | Sign in again, then unlock the saved vault                                                |
| No account/owner mismatch            | Use an existing Mainnet account ID and its owning wallet                                  |
| Delegate unverified/inactive account | Owner must register the correct public key or resolve account activation                  |
| Signed metadata rejected             | Check account/delegate registration and provider availability, then reconnect             |
| Tatum authentication/schema error    | Check Mainnet key scope and Sui access; never substitute Testnet                          |
| Vault cannot unlock                  | Use the same wallet and password; there is no password recovery                           |
| Storage unavailable                  | Enable browser storage or use a private supported profile; no server persistence fallback |

`npm run diagnose:walrus` uses optional local `.env` diagnostic credentials,
**not** the browser vault. It performs read-only checks and prints only safe
flags/counts. Do not paste keys into chat. Changing a network setting does not
make an old Testnet account/delegate valid on Mainnet.

`npm run check` uses generated test keys, mocked providers and isolated HTTP
servers. Passing tests do not prove that your real wallet/account is connected
or that any real Mainnet memory has been stored.
