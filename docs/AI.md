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

Pinned chat/embedding endpoints use `provider.data_collection:deny` and
`require_parameters:true`, without tools, plugins, prior conversation IDs or
automatic retries. This can make free models unavailable if no endpoint meets the
privacy/output requirements; no relaxed privacy fallback is made. OpenRouter and
upstream privacy policies still apply; zero retention is not guaranteed.
Model text is displayed as text, not executable HTML. References
are restricted to submitted IDs and never establish Mainnet provenance.

Only explicit allowlisted `:free` model IDs are accepted. Provider fallbacks are
disabled and `max_price` caps prompt/completion/request/image prices at zero.
No paid models or model fallback arrays are used. Free quota/rate limits and
availability can change; failed/aborted requests may still consume quota. Check
[free-model limits](https://openrouter.ai/docs/guides/routing/model-variants/free)
and your provider usage. Never top up credits just to work around an app error.
Limits: 100 records/request, 1,000-character questions, one AI request at a
time per wallet session, 12/minute, 1,800 maximum output tokens, a 192 KB request-body
limit on the AI route (other routes remain 32 KB), and bounded responses.
Mainnet Tatum/MemWal operations are separate and are not made free by this AI change.

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
