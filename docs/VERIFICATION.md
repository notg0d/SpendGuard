# Verification — 28 October 2026

## Per-request demo-data privacy opt-in

- Added an optional, unchecked assistant checkbox explicitly attesting synthetic
  question/context and accepting provider retention/training. Sharing consent is
  still separate. Both choices reset on requests and context/access changes.
- Validated boolean opt-in reaches chat/embedding routing only for that request;
  provider overrides cannot enable it implicitly. It is not saved in credentials,
  workspace or session state. Results label the requested policy, and embedding
  cache entries are partitioned by privacy choice.
- Free-only model allowlists, zero price caps, disabled fallbacks/tools/retries,
  output validation, encryption and wallet gates remain unchanged. Errors after
  opt-in explain that OpenRouter account privacy restrictions cannot be overridden.
- `npm run check` passed all **72 tests**, TypeScript, production build and isolated
  production HTTP smoke. Tests use mocked providers; no live authenticated
  inference, provider privacy-setting changes, Mainnet upload or payment occurred.
- The local-only browser fixture verified generated-wallet signature login and
  AI-only encrypted-vault setup with zero inference during setup. Explicit demo
  chat → strict chat → demo search sent policies `allow`, `deny`, `allow`. Results
  labelled the policy; sharing consent and demo opt-in reset after completion.
- Browser checks also confirmed resets on question/task/selection changes and
  an injected mock failure. Toggling demo opt-in cleared separate sharing consent
  and left submit disabled until consent was confirmed again.
- Rendered-DOM iframe checks at 390/768/1440 CSS pixels in both themes found no
  horizontal document overflow; the new label/hint fit and theme tokens resolved.
  Inspected console contained no warnings or errors. Pointer tools reported
  `UnknownVizError`, and screenshot capture required an unavailable visible tab;
  these checks used DOM actions/layout inspection, not screenshot review.
- Signed out the generated-wallet session, removed only its synthetic vault,
  workspace and connection state, closed the test tab and stopped fixture PID
  28756. The original backend was not restarted; restart it to load this update.
- Successful authenticated OpenRouter inference after opt-in remains unverified;
  account Privacy settings/guardrails can still block free endpoints.
- Final `git diff --check` passed with line-ending warnings only. Changes remain
  uncommitted; no deployment or publication occurred.

## Repository cleanup

- Removed nine unused reference UI/service/mock-route files, two obsolete build
  plans and archived Testnet setup instructions; attribution and current guides remain.
- Cleanup verification passed all **62 tests**, typechecking, build and production
  HTTP smoke. Generated `dist/` output was removed after that check; the subsequent
  AI diagnosis check below regenerates the production build.
- The first rename attempt was blocked by Windows access denial. The user later
  moved the project to `C:\Users\Uwaise\u\SubSense`; the active folder name is now correct.

## AI error diagnosis update

- Rechecked public metadata for all three chat endpoints and the embedding endpoint.
  They are still listed with zero prompt/completion prices and the expected chat
  output capabilities. This does not establish privacy eligibility, account quota,
  or successful authenticated inference.
- Aligned all zero-price caps with the current OpenAPI decimal-string schema;
  strict data-collection denial remains the default; required parameters and
  disabled fallbacks remain enforced.
  The routing guide also shows numeric price examples, so the old numeric format
  is not established as the cause of the user's failure.
- Replaced the misleading generic failure with bounded, secret-safe HTTP/category
  diagnostics, including privacy/output filtering, key/account restrictions,
  provider quota/availability, and HTTP-200 error envelopes. No raw upstream
  message, metadata, flagged input or request ID is forwarded or logged.
- Added mocked regressions for both transports' zero-price constraints, classified
  failures, bounded/unreadable bodies, error envelopes, cancellation/timeout, and
  authenticated route diagnostics/busy-gate cleanup. See `AI.md` for retry steps.
- `npm run check` passed all **68 tests**, TypeScript, production build and isolated
  production HTTP smoke. `git diff --check` passed with line-ending warnings only.
- The original failed response was discarded by the old code. The user's later
  explicit retry reported `PRIVACY_BLOCKED` with OpenRouter HTTP 404, establishing
  a data-policy routing block for that retry. No user key or context was sent by
  the agent in this investigation; agent-run inference checks remain mocked.

## Current free-model gateway update

- Removed retired-provider labels/model choices and switched inference to pinned
  OpenRouter chat/embedding endpoints. The live public catalogs listed Nemotron
  3.5 Super VL, Flint v1.0, Xing4.0 and Nemotron 3.5 Embed 1B as free; see `AI.md`.
- `npm run check` passed **62 tests**, TypeScript, production build and isolated
  HTTP smoke. `git diff --check` passed with line-ending warnings only.
- New mocked regressions cover key verification without inference, changed/missing
  catalog prices, output capabilities, zero-price routing, forbidden paid fallback
  arrays/plugins/tools, all three chat formats, malformed/refused output, native
  embedding dimension bounds/cache changes and explicit legacy-vault replacement.
- An isolated port-3100 fixture verified generated-wallet sign-in, AI-only encrypted
  vault save, explicit question/search, consent reset, provider lock and correct-
  password unlock. Setup/unlock made zero inference calls; question/search made one
  each. Saved storage contained no plaintext synthetic provider key. All three
  model labels/default selection appeared with no retired-provider branding.
- Rendered-DOM iframe checks for assistant results and credential model choices at
  390/768/1440 CSS pixels in both themes found no horizontal document overflow.
  Inspected console had no errors. Browser pointer clicking reported a tooling
  visualization failure; subsequent checks used DOM actions, not screenshots.
- The generated-wallet session was signed out, synthetic vault/workspace removed,
  test tab closed and fixture PID 22092 stopped. The existing port-3000 backend was
  not restarted; restart it manually to load these changes.
- Public catalog availability is **not authenticated inference verification**.
  No real user key, free-model inference, paid AI operation, or real Mainnet
  account/delegate/upload/recall was tested. Strict privacy/format routing may
  leave no usable free endpoint; the app fails without paid or relaxed fallbacks.

## Prior AI assistant and empty-workspace update

- New workspaces start empty; runtime sample generation and the sample-loading
  control are removed. Legacy saved workspaces are preserved, not erased.
- `npm run check` covers **57 tests**, TypeScript, production build and isolated
  HTTP smoke, including AI-specific body limits and anonymous AI denial.
- Prior-provider credential validation/encryption, model-only setup checks, consent/context
  bounds, tool-free `store:false` requests, deterministic context, reference filtering,
  similarity ranking/cache invalidation, secret exclusion/redaction, identity/origin/
  Mainnet gates, concurrency/rate limits and abort-on-lock are mocked regressions.
- A local-only browser fixture (`tests/fixtures/ai-browser.mjs`) served the real
  built frontend and wallet router. An unfunded generated wallet signed a real
  verified login. AI-only vault creation, ciphertext-only storage, explicit question
  and embedding requests, consent reset, lock and password unlock passed against
  mocked providers. Setup made zero inference calls; question/search each made one.
- Rendered-DOM iframe checks for the assistant at 390/768/1440 CSS pixels in both
  themes found no document overflow; paired form buttons had matching heights.
  Inspected browser console contained no errors. This is not exhaustive UI auditing.
- The synthetic browser vault/workspace were removed, its session signed out, its
  test tab closed and the isolated port-3100 fixture process stopped after checks.
- No real provider key/inference/billing or real Mainnet connection/upload/recall was
  tested. Model-list access does not guarantee working inference or quota.
  The original port-3000 backend remains untouched and needs a user restart.

## Current wallet-first Mainnet flow

Wallet-first Mainnet login, encrypted browser vaults and per-user backend provider
sessions supersede the historical Testnet/app-token flow below. Current setup is
in `MAINNET.md`. Automated tests use generated signatures and mocked providers;
no real owner wallet login or Mainnet MemWal connection/upload/recall is claimed.

Workspace-token authentication has been removed entirely, including its former
standalone test-fixture fallback and CLI connection-check path. Unauthenticated
private requests now ask for Sui wallet sign-in only; Bearer tokens cannot unlock
them. Configuration reports `walletAuthenticated`, not token configuration.

- **50 tests before the AI update** covered the existing product plus the wallet/vault flow.
  A render regression now checks the wallet library's required Mainnet contexts;
  browser RPC is explicitly disabled, not routed to a public chain endpoint.
- **Isolated browser checks:** production assets served on local port 3100,
  leaving the existing port-3000 process untouched. No installed Sui wallet was
  detected; the chooser explains how to install one. Escape closed the dialog
  and returned focus to its trigger, with background content inert while open.
- A deterministic, unfunded **synthetic wallet** connected via Wallet Standard
  and signed a generated login challenge. The real backend verified that test
  signature and opened wallet-scoped Connections onboarding. This does not prove
  compatibility with an actual owner wallet extension.
- **Mocked-provider browser checks** covered password mismatch, encrypted vault
  save, lock, wrong-password rejection, correct unlock, replacement storage
  failure, forgetting the test vault and sign-out. Saved ciphertext contained no
  plaintext keys/password; the vault password was absent from captured configure
  bodies. A simulated storage failure preserved the old ciphertext and removed
  the mocked backend connection. No real provider keys or Mainnet calls were used.
- Static rendered-DOM iframe fixtures checked login and credential onboarding at
  390, 768 and 1440 CSS pixels in light/dark themes: **12 checks, no horizontal
  document overflow**. Password controls had consistent 40px heights. The login
  screenshot was visibly reviewed; inspected browser console had no errors after
  the provider-context fix. This is representative, not exhaustive UI auditing.
- The synthetic vault was removed and the test session signed out. No existing
  workspace was overwritten. The owner still needs to restart the original
  backend and connect their real Mainnet wallet/account/delegate.

## Automated

`npm run check` runs:

- TypeScript checking of the new app and retained reference source.
- Node tests: amounts/dates/validation, annual budgeting, latest-feedback
  learning, essential protection, price-change review, future/unrelated records,
  exact SUI arithmetic, receipt stripping, namespace isolation, SDK submission
  arguments, job completion, recall filtering, strict payment matching,
  trusted upstream, wallet-only authentication, health isolation, credential redaction,
  browser workspace parsing/recovery, real generated personal-message verification,
  challenge replay/expiry/origin rejection, wallet isolation, vault encryption,
  Mainnet owner/delegate checks, revocation races and stale browser responses.
- Vite production build.
- Isolated ephemeral-port production smoke: HTML and built JS, configuration API,
  disabled legacy APIs/development modules, JSON parse errors, and request limits.

Unit/integration tests use injected clients or local HTTP responses. They do not
count as live Tatum or Walrus verification.

## Browser checks executed

Chromium browser tools were connected, but the Review pane was not visible.
DOM-based interactions and computed layout inspection were used rather than
pointer clicks/screenshots. Only synthetic test data was created.

| Check                                                                  | Result                                                                     |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Honest sample overview and calculated commitments                      | Passed                                                                     |
| Explicit sample → empty workspace confirmation                         | Passed                                                                     |
| Add manual service; reject a price with 3 decimal places               | Passed                                                                     |
| Rare/optional usage produces downgrade advice                          | Passed                                                                     |
| Save essential client-handoff feedback; compare downgrade → keep       | Passed                                                                     |
| Service importance/status remain unchanged by feedback                 | Passed                                                                     |
| Reload preserves subscriptions and learning                            | Passed                                                                     |
| Edit price above 10% threshold → fresh review                          | Passed                                                                     |
| Confirm provider renewal → advance tracked date                        | Passed                                                                     |
| Save USD budget and dark appearance                                    | Passed                                                                     |
| Missing credentials shown honestly; private actions disabled           | Passed                                                                     |
| Modal initial focus and forward focus wrap                             | Passed via DOM keyboard event                                              |
| Corrupt storage preserved; mutation disabled                           | Passed                                                                     |
| Validated backup import requires confirmation and clears recovery lock | Passed                                                                     |
| Workspace export download                                              | Passed: completed JSON download containing synthetic test data             |
| 390px and 1440px viewport layouts in browser iframe fixtures           | Passed: no page-level horizontal overflow; mobile table scrolls internally |
| Console inspection                                                     | No errors observed during inspected flows                                  |

The responsive fixture tab was closed. The synthetic test workspace was exported,
then replaced with the labelled sample workspace for review. No pre-existing user
workspace was overwritten. No real memory uploads or transactions occurred.

## UI refinement verification

The shell, overview, inventory,
renewal panels, journal, connections, settings and form choices were refined.
No new dependencies, provider requests, uploads or storage migrations were added.

- **Visible review:** screenshots inspected for the desktop and tablet overview,
  desktop connections, and mobile overview. The Review pane became available;
  the first-pass screenshot limitation no longer blocks these representative
  checks. Desktop/light and other route checks also used computed geometry.
- **Responsive:** all six routes at 390, 768 and 1440 CSS pixels, in light and
  dark themes: 36 checks without document overflow. Inventory scrolls inside its
  container (390px fixture: 342px container / 820px table; desktop fits).
- **Controls:** mobile add form stays within the viewport and scrolls internally;
  native date/text inputs and filled/outlined/icon-only buttons resolve to the
  same shared minimum height.
- **Keyboard/pointer:** real pointer opened navigation; native Shift+Tab and Tab
  wrapped focus, Escape closed it, and focus returned to its trigger. Background
  content is inert and scrolling is locked only while the overlay is open.
  Native radio arrow keys moved and selected the adjacent decision correctly.
- **Product regression:** synthetic service add, filtering/empty results, edit,
  rare-usage downgrade → essential-context keep, reload persistence, price-rise
  fresh review, and header theme persistence passed. Feedback did not change
  provider status or declared importance. Missing integrations remain disabled.
- **Automated browser audit:** the representative dark overview scored 100 for
  accessibility and best practices in Lighthouse; no console errors were found.
  An accessible-label mismatch was corrected and the audit repeated. SEO was 80
  because the existing SPA fallback does not serve a valid `robots.txt`; that
  hosting concern was not changed during UI work. This is not an exhaustive
  assistive-technology or security audit.
- The original labelled six-service/one-decision sample workspace and its saved
  dark theme were restored after synthetic tests. No owner workspace was replaced.

## Historical: Testnet-first integration extension (superseded)

- Default network is now `testnet`; exact server-controlled `mainnet` selection
  remains available. Invalid configuration fails startup. Fixed trusted URLs,
  request network pins and 409 rejection prevent silent cross-network retries.
- Tatum Testnet GraphQL was confirmed through gateway `/_methods` and `llms.txt`.
  Balance/payment queries use the installed Sui schema. Added read-only native
  SUI balance API and UI, without wallet connection or automatic transfers.
- Walrus staging URL is documented by its official managed-relayer guide. Its
  `/config` must report the selected network before SDK construction. Mainnet
  namespaces are preserved; Testnet namespaces/idempotency/jobs are separate.
- Independent per-network receipts preserve both networks when decisions merge.
  Journal/Overview count Testnet separately; payment provenance/replay checks
  carry a network. Older unlabelled proof migrates as Mainnet; imports strip all
  receipt and payment proof, preserving the profile for recall.
- `npm run check` passed with **31 offline tests**, type checking, production build
  and production HTTP smoke. Added regressions for exact/default network selection,
  wrong-scope failure without fallback, exact/zero balance arithmetic, independent
  namespaces/idempotency, cross-network job rejection, relayer chain mismatch,
  receipt merges/migration/import, and stale/missing network API rejection.
- Local setup and read-only connection-check scripts added; neither prints secrets
  nor uploads memories. Setup never overwrites an existing `.env`.
- Browser DOM checks confirmed active Testnet endpoints/labels, configuration
  refresh and disabled private operations while credentials are absent. Overview,
  Journal and Connections passed 18 settled-state geometry checks at 390, 768
  and 1440 CSS pixels in both themes without document overflow. No browser-local
  workspace or token was modified. The desktop window was not visible during
  this extension's screenshot attempt, so new pixel review is not claimed.
- The historical Testnet setup instructions have been removed; current setup is
  in `MAINNET.md`. No credentials were available during this implementation. Authenticated
  live reads/writes remain unverified. An unauthenticated staging `/config` fetch
  could not complete from this environment; no Mainnet fallback was attempted.

## Follow-up: configured provider connectivity

- `.env` presence and key/account format were checked without printing secrets.
  Live token-gated Tatum Testnet `__typename` health query succeeded. Balance and
  transaction verification are still separate, unverified live operations.
- Walrus's documented staging endpoint failed the TLS handshake with
  `ERR_TLS_CERT_ALTNAME_INVALID`, presenting Railway domain certificate names
  instead of the requested relayer hostname. Failure occurred before delegate
  authentication/SDK creation. No upload or Mainnet fallback was attempted.
- Added safe, actionable certificate, timeout and DNS error messages plus an
  offline regression covering single-endpoint requests and blocked SDK creation.
  Certificate validation remains enabled. The user's running server was not killed;
  a restart is needed to load the improved backend error messages.
- `npm run check` passed again: **32 tests**, type checking, production build
  and HTTP smoke. A fresh read-only probe confirmed the new actionable TLS error.

## Testnet relayer URL correction

The official MemWal GitHub managed-relayer guide now lists
`https://relayer.dev.memwal.ai` for Testnet, unlike the older published website.
Read-only public HTTPS checks verified `/config` reports `testnet` and `/health`
reports healthy status. The fixed Testnet URL and its regression expectation have
been updated. TLS enforcement, network checks, namespaces and Mainnet URL are
unchanged. No upload or delegate-authenticated recall was performed.
The configured SDK client also completed its read-only health request with
`status: ok`. `npm run check` passed: 32 tests, type checking, production build
and HTTP smoke. The user's existing server must be restarted to load the new URL.

## Signed recall authentication diagnosis

- The configured account returned no object through Tatum Sui Testnet GraphQL.
  In the same lookup, the trusted relayer's package and MemWal registry existed.
  Account existence/delegate membership could not be verified. The ID was not
  the configured delegate's wallet address; its original source is unknown.
- A signed SDK metadata-only `listNamespaces({ limit: 1 })` request returned
  **401 AUTH_REJECTED**. No memory contents were retrieved. The HTTP server-date
  comparison was within the five-minute signature window. No account creation,
  delegate registration, upload, transfer or Mainnet lookup was performed.
- Added `npm run diagnose:walrus` for owner-run read-only account/delegate checks.
  Public keys are derived locally; only flags/counts are printed. Unknown layouts
  remain unverified, and package differences alone do not imply failure.
- Signed memory failures now refer to this app's `.env` and the diagnostic,
  instead of the SDK's generic `.env.local` suggestion. Clock-specific errors
  retain their separate action. The running server was not stopped or changed.
- `npm run check` passed: **37 tests**, type checking, production build and HTTP
  smoke. The new live diagnostic reproduced the missing Testnet account while
  confirming the relayer deployment was present; it exited non-zero as intended.

## Remaining release work

- Exhaustive keyboard traversal, assistive-technology testing and accessibility
  auditing of every route/state (representative native keyboard and Lighthouse
  checks above are complete).
- Authenticated Tatum GraphQL query against an actual Mainnet payment.
- Actual Walrus delegate/account access, write completion, recall after restart,
  and confirmation of at least 10 meaningful unique Mainnet memories.
- Hosted deployment and an independent multi-user security review (wallet session
  isolation is implemented and regression-tested, not production-audited).
- Public repo/video/blog submission and reference-author reuse permission.

`npm audit` reports four unresolved inherited dependency findings. No forced
breaking upgrade or clean-security claim has been made.
