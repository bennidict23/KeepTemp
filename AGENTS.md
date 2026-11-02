# KeepTemp project guidance

Before product or UX changes, read `docs/product-brief.md`. It records the user's product origin and decision criteria.

Core job: let people keep using Temporary Chat normally while automatically retaining a reliable local plaintext copy they can find and use to continue later. Do not substitute manual copy/paste/import as the main saving workflow or build a different chat client.

Keep the product small: automatic capture, durable local storage, search/read, context copy, export and necessary pause/exclude/delete controls. Keep synthetic demos, diagnostics and developer tools out of the shipped product flow. No cloud, accounts, telemetry, AI summaries or unrelated features. The user has authorized a generic HTTPS capture prototype and DeepSeek DOM experimentation. Built-in temporary capture remains strict; generic recording starts from one explicit Record click per conversation, with no preview or second application confirmation and never claims platform history is hidden.

Use synthetic data and isolated browser profiles for verification. Never read private user conversations for development or include real contents in logs, fixtures or snapshots. Preserve stored user data on upgrades. Do not claim tests on synthetic DOM prove all live platform layouts work.

Keep privacy claims bounded: local storage is not encrypted application storage; retaining a local copy does not create platform-level user isolation in a shared account, remove provider retention, or restore the original server session, attachments or tool state. Show Saved only after persistence succeeds.

In the user's terminology, "prompt" means the continuation instructions bundled with the saved transcript for the model in a new chat. It does not mean developer/project guidance. The copy action must include both the complete role-labelled history and this continuation prompt, so the user can paste once without rewriting background. Do not silently summarize, truncate, upload, or auto-send the history.

Claude, Grok and Gemini capture remain experimental until actual-account acceptance. Continuation prompts stay platform-neutral; source labels appear only in the UI and exports.

The user explicitly confirmed on 2026-11-02 that ordinary or unknown-mode conversations may be saved on request, with privacy boundaries kept in first-use information and settings, not repeated for each save. Generic capture must never silently enable another conversation. Do not promote experimental generic/DeepSeek extraction as universal or live-verified support.

The one-click explicit-recording fallback applies to built-in sites too. Do not hard-block the manual entry on regular/unknown mode; fall back only for regular, temporary-unknown or no-content. Never bypass paused/excluded/write failures. Deleted records must not return automatically; a new explicit Record click may replace the tombstone using only currently readable content. Reuse built-in session identities for explicit copies, preserving per-conversation consent and metadata. Toolbar access must be verified with an unmodified shipping manifest, not just pregranted synthetic hosts.

The user requires minimal black/white themes with a persistent light/dark toggle, no green palette or repeated privacy notices. QA must simulate repeated recording, new turns, deletion then manual re-record, refresh, tabs, streaming, virtual windows and storage failure before delivery. Verify the actual row after commit and clear search filters so successful records remain visible. Do not call UI-only success a verified persistence result.
