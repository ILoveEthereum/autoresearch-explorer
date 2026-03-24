# Sidebar Redesign

## Layout
- 48px dark icon rail on far left (#111827)
- 280px overlay panel floats over canvas when icon clicked
- Active icon gets left accent bar
- Settings pinned to bottom of rail

## Icons (top to bottom)
1. Home — session list
2. Canvas — closes panel, shows canvas (default)
3. Chat — chat panel
4. Skills — 3 tabs: Canvases, Tools, Skills
5. Integrations — Telegram + future messaging
6. Settings — app settings (pinned bottom)

## Skills Panel Tabs
- Canvases: project tree (main + sub-agents), click to switch
- Tools: built-in list + custom tools with status, "+ Build New Tool" button
- Skills: past session skill docs, expandable, "+ Build New Skill" button

## Build Buttons
- "Build New Tool" → opens wizard with tool-builder template pre-selected
- "Build New Skill" → opens wizard with skill-builder template pre-selected

## Data Locations
- App-level: Tauri app data dir (skills/, tools/, memory.db, config.json, sessions.json)
- Per-project: {working_dir}/autoresearch/ (visible, no dot)
- Global config folder: ~/autoresearch/ removed, use Tauri app data dir instead

## Changes from current
- Remove standalone ProjectTree, ChatPanel, Settings rendering from App.tsx
- Everything goes through the icon rail
- Unhide ~/.autoresearch/ → use Tauri app data dir
