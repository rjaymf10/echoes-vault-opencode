---
description: Inspect EchoesVault protocol, storage, metadata, conflicts, Git readiness, and scale
allowed-tools: Bash(bash "${CLAUDE_PLUGIN_ROOT}/bin/echoes" *)
---

!`bash "${CLAUDE_PLUGIN_ROOT}/bin/echoes" status --format card 2>&1`

Return the compact status card above. This operation is strictly read-only: do not initialize,
migrate, hydrate, repair, or edit the vault while reporting status.
