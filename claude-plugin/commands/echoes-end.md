---
description: Explicitly finalize the session into EchoesVault
disable-model-invocation: true
allowed-tools: Bash(bash "${CLAUDE_PLUGIN_ROOT}/bin/echoes" *), Read
---

The user explicitly authorized final session saving.

Distill the session into dense final outcomes, verified decisions, unresolved blockers, and next
steps—not a transcript. Prepare only durable knowledge pages that add or materially revise reusable
project knowledge. Every page must contain `type`, `stack`, `status`, and a one-line `summary` of at
most 160 characters.

Before replacing an existing page, read it and get its current hash immediately before saving:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/bin/echoes" hash <filename>
```

Then save exactly once, passing the payload as JSON on standard input through a quoted heredoc so
the shell never interprets the Markdown:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/bin/echoes" end --confirm-explicit-user-end --payload - <<'ECHOES_VAULT_JSON'
{"dailySummary": "...", "pages": [{"filename": "page.md", "content": "---\n...", "expectedSha256": "<only for existing pages>"}]}
ECHOES_VAULT_JSON
```

Use `"pages": []` when no page changes are warranted. Never edit `EchoesVault/index.md`; the shared
runtime generates it. Report the runtime's result, including any error, to the user.
