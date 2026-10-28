# claude_mods

Roger's personal mods for the Claude desktop app. Each mod is a folder at the repo root; `.claude-plugin/marketplace.json` lists them.

## Mods

- **context-cockpit**: a thin bar above the prompt (desktop app only). Context ring, Compact with auto and smart compact, subagent counts per model, prompt-cache timer with Ping / Compact / Ignore modes, and session and weekly limit gauges.

## Install

In the desktop app: click + next to the prompt box, then Plugins, Add marketplace with `necrobooder/claude_mods`, then Add plugin.

From a terminal session:

```
/plugin install context-cockpit --marketplace necrobooder/claude_mods
```

From a shell:

```
claude plugin install context-cockpit --marketplace necrobooder/claude_mods
```

The repository is public, so no git credential is needed to install.

## Adding a mod

Make a new folder beside `context-cockpit` with `.claude-plugin/plugin.json`, `hooks/hooks.json` and `hooks/register.tsx`, then add an entry to `.claude-plugin/marketplace.json`.
