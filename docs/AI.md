# Free AI setup and safety

1. Restart the backend to load the new API, then sign in with your Sui Mainnet wallet.
2. Create an [OpenRouter API key](https://openrouter.ai/settings/keys). In Connections,
   add it and choose a free assistant model. Existing vault?
   Use **Replace credentials** and re-enter every key/account you want to retain.
3. Leave all three Tatum/MemWal fields empty for AI-only use, or fill all three for
   a verified Mainnet connection. Create/confirm a strong vault password and save.
   Only encrypted credentials are persisted after all chosen providers verify.
4. Open **AI assistant**, select a task and specific records, enter your question,
    and confirm sharing with OpenRouter and its model provider. Consent resets after every request/context change.

## Features

- **Ask**: subscription/budget questions using selected context.
- **Explain**: describe deterministic decisions and relevant prior reasons.
- **Plan renewals**: suggest a review plan; no cancellation, reminders or payments
  are executed or scheduled by AI.
- **Semantic search**: embedding similarity over selected subscriptions and
  decisions, including previously recalled MemWal context. It is not an exhaustive
  remote search. Similarity is not confidence or proof.

## Models checked on 28 October 2026

| Use | Model | Listed date |
| --- | --- | --- |
| Default chat | `nvidia/nemotron-3.5-super-vl:free` | 15 October 2026 |
| Newest chat option | `recursive/flint-v1.0:free` | 21 October 2026 |
| Alternative chat | `xingchen-agi/xing4.0-29b-a4b:free` | 16 October 2026 |
| Semantic search | `nvidia/nemotron-3.5-embed-1b:free` | 21 October 2026 |

These dates are catalog listing timestamps, not independently verified release dates.
All four were listed with zero prompt/completion pricing in the live
[chat catalog](https://openrouter.ai/api/v1/models) and
[embedding catalog](https://openrouter.ai/api/v1/embeddings/models).
Setup authenticates `/api/v1/key` and verifies current free listings and output
capabilities without inference. It cannot guarantee key-specific access or quota.
Nemotron/Xing use strict JSON schema; Flint uses JSON-object output with the same
server-side validation. Embeddings use native dimensions, validated consistently
between 1 and 4,096; dimension changes clear the cache and fail the current search.

## Privacy and free-only routing

Only explicitly selected, validated records and your question are sent to OpenRouter and its model provider;
advice additionally includes your planning budget and selected-subset computed
totals/rules. Keys go only in the provider's authorization header, never model
context. Extra fields, wallet IDs, payment evidence and on-chain receipts are
excluded. Notes can still contain sensitive text: review them before selecting.

Pinned chat/embedding endpoints default to `provider.data_collection:deny` and
`require_parameters:true`, without tools, plugins, prior conversation IDs or
automatic retries. This can make free models unavailable if no endpoint meets the
privacy/output requirements; no automatic relaxed privacy fallback is made. OpenRouter and
upstream privacy policies still apply; zero retention is not guaranteed.
Model text is displayed as text, not executable HTML. References
are restricted to submitted IDs and never establish Mainnet provenance.

Only explicit allowlisted `:free` model IDs are accepted. Provider fallbacks are
disabled and `max_price` caps prompt/completion/request/image prices at the decimal
string `"0"`, matching the current OpenAPI schema.
No paid models or model fallback arrays are used. Free quota/rate limits and
availability can change; failed/aborted requests may still consume quota. Check
[free-model limits](https://openrouter.ai/docs/guides/routing/model-variants/free)
and your provider usage. Never top up credits just to work around an app error.
Limits: 100 records/request, 1,000-character questions, one AI request at a
time per wallet session, 12/minute, 1,800 maximum output tokens, a 192 KB request-body
limit on the AI route (other routes remain 32 KB), and bounded responses.
Mainnet Tatum/MemWal operations are separate and are not made free by this AI change.

### Optional synthetic-demo privacy choice

For a public hackathon demonstration using **only synthetic questions and records**:

1. Select your demo context and write the question first.
2. Check **Allow data-collecting providers for this demo request · optional**. Its
   label confirms that the context/question are synthetic and acknowledges that
   providers may retain or train on them. The app relies on this attestation; it
   cannot independently determine whether your notes contain real personal data.
3. Check the separate sharing-consent checkbox, then explicitly submit.

Only this request uses `provider.data_collection:allow`; it applies to chat and
semantic search. Strict privacy stays the default. The opt-in resets after success
or failure, on question/task/selection/workspace changes, and when connection or
wallet state changes. Changing the opt-in clears sharing consent, requiring you
to confirm again. It is never stored in the vault, workspace or backend session.
Results state which routing policy was requested. Embedding cache entries are
separated by privacy policy; relaxed-request vectors are not reused by strict requests.

The allowlist, zero price caps, output validation, disabled fallbacks/tools/retries,
credential encryption and wallet authentication are unchanged. This is not a
promise that inference will work: your OpenRouter account's free-model training,
provider and ZDR restrictions/guardrails still apply and cannot be overridden by
the app. Review [Privacy settings](https://openrouter.ai/settings/privacy) yourself
only if you understand and accept the tradeoff for this synthetic demo. Do not
use this option for private financial or client data.

## Troubleshooting failed requests

Restart the backend after updating (`npm run dev`, or rebuild with `npm run build`
before `npm start`). Sign in, unlock the existing vault, and explicitly retry with
one selected record and fresh consent. No vault replacement is needed for this update.

The old generic "unavailable or cannot satisfy the privacy/output requirements"
message covered unrelated failures too. Its original upstream status/body was not
retained, so that message alone does not identify the cause. Errors now include
the OpenRouter HTTP status and a safe category in the API's `diagnostic` field:

| Category | What to check |
| --- | --- |
| `PRIVACY_BLOCKED` | No endpoint matched the data policy. Review [Privacy settings](https://openrouter.ai/settings/privacy); keep your privacy requirements, or explicitly opt in for synthetic demo data only. If it fails after opt-in, account Privacy/guardrail restrictions can still block it. The app never changes privacy automatically. |
| `OUTPUT_UNSUPPORTED` / `REQUEST_REJECTED` | Output/parameter routing or validation failed. Restart with the latest request format; if it persists, try another supported free chat model. |
| `KEY_REJECTED` / `ACCESS_BLOCKED` | Active inference key, model permissions, and account guardrails. |
| `ACCOUNT_LIMIT` | Key/workspace budgets or account status. Do not add credits just to work around a free-only app error. |
| `FREE_QUOTA` | Provider quota/rate limits; wait and inspect [usage](https://openrouter.ai/activity). No automatic retry is made. |
| `PROVIDER_BUSY` / `PROVIDER_TIMEOUT` / `PROVIDER_UNAVAILABLE` | Temporary provider failure, not proof of a privacy problem. Try later. |
| `NO_FREE_ENDPOINT` | No usable route under the current model/account settings; the precise filter is unknown. |
| `CONTEXT_TOO_LARGE` / `CONTENT_BLOCKED` | Reduce or review the selected context and question. |

Changing the saved chat model still requires **Replace credentials** in Connections;
export the vault first and re-enter every credential you want to retain. Chat model
changes do not change the semantic-search embedding model. Never share keys,
passwords, vault plaintext, or private record text for troubleshooting; share only
the displayed sanitized error/status. Do not relax data collection to bypass a
failure without understanding and explicitly accepting the privacy tradeoff.

Non-success bodies are read up to 16 KiB for classification, then discarded; raw
messages/metadata are never displayed or logged. HTTP-200 error envelopes are also
rejected rather than treated as advice or embeddings. Success responses retain
the 4 MB safety limit. No retry, paid fallback, or workspace change is introduced.

Embedding cache is bounded to 300 vectors/session, not stored on disk or in browser
storage. Lock/sign-out/expiry/restart clear provider keys and cache; locking aborts
in-flight AI requests (quota already consumed cannot be undone). Results are
temporary; there is no durable chat or vector database. Local workspace data is
still unencrypted, separate from the encrypted credential vault.

## Older encrypted vaults

Old provider keys are not compatible and are never treated as gateway keys.
Decrypting an older provider vault shows a replacement message and leaves the
saved ciphertext untouched. Export it first, then use **Replace credentials**
with a new OpenRouter key and re-enter every Tatum/MemWal credential you want to
retain. Password/wallet encryption is unchanged. Blockchain-only vaults remain
compatible; existing workspaces are never reset by this migration.

Tests use generated-wallet sessions and mocked gateway responses. No live user
key, authenticated inference, Mainnet upload or recall is implied by passing checks.
