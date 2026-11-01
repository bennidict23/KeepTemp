# KeepTemp project guidance

Before product or UX changes, read `docs/product-brief.md`. It records the user's product origin and the prompt that should guide decisions.

Core job: let people keep using Temporary Chat normally while automatically retaining a reliable local plaintext copy they can find and use to continue later. Do not substitute manual copy/paste/import as the main saving workflow or build a different chat client.

Keep the product small: automatic capture, durable local storage, search/read, context copy, export and necessary pause/exclude/delete controls. Keep synthetic demos, diagnostics and developer tools out of the shipped product flow. No cloud, accounts, telemetry, AI summaries or broad platform expansion.

Use synthetic data and isolated browser profiles for verification. Never read private user conversations for development or include real contents in logs, fixtures or snapshots. Preserve stored user data on upgrades. Do not claim tests on synthetic DOM prove all live platform layouts work.

Keep privacy claims bounded: local storage is not encrypted application storage; retaining a local copy does not create platform-level user isolation in a shared account, remove provider retention, or restore the original server session, attachments or tool state. Show Saved only after persistence succeeds.
