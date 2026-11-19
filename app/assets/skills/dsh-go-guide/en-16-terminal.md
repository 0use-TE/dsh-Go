# Terminal

The conversation's terminal: run commands in the same workspace the agent uses. Commands run on the host — the on-device engine on this phone, or a remote host on your computer or server.

The terminal belongs to the open conversation, so open one first.

<!-- nav: catalogAllFeatures,catalogTerminal -->
`All features › Terminal`

The page shows **Terminal** over the current directory, a row of tabs, the terminal below, and a key row above the keyboard.

## Terminal panel in a conversation

The terminal stays below chat and does not host plugins. Click the terminal button at the upper right or press Ctrl + backquote on a hardware keyboard to show or hide it. The hidden panel occupies no space; the open panel has no extra title bar. Drag the separating gap to adjust its height. Compact terminal tabs align with the top of the terminal at the right edge; the new-terminal button sits at the bottom right. Hold a tab to rename or close it. Ctrl + 1–9 selects the corresponding terminal, reopening the panel when hidden. The original fullscreen terminal remains in All features.

The panel omits the phone's extra key row; use hardware keyboard shortcuts directly. The fullscreen terminal retains the extra keys. Both views share the conversation's terminal tabs. Hiding the panel keeps terminals running and stops keyboard input; reopening restores their tabs and content. Use `+` to create terminals; closing a tab ends its process.

## Right-side plugin tabs and splitting

By default, Conversation details retains the original Plugins navigation tab. Multiple plugin views appear as a list: select a view to open it. A single view uses the original direct display. Enable Show independently in an installed plugin’s details to move that plugin from the Plugins page to the outer right workspace on wide screens. Disable it to return the plugin to its original Plugins page. A plugin appears in only one of these places. Preferences are saved locally per host and package name; existing marketplace plugins keep the original entry and loading behavior by default. Narrow windows continue to use the original Plugins page. All features and plugin management remain available.

Click and drag a tab with a mouse or trackpad; on touchscreens, hold before dragging. Drop on the left or right of another outer tab to reorder, with adjacent tabs sliding aside. Drop it at the top or bottom of the content area to split the column into two groups; after splitting, drop it into the other group to move it. Conversation details can move too. Each tab belongs to one group only; moving the last tab out merges the groups. Drag the separator to resize. Drop previews show highlighted regions without instruction text. Layout and tab order are saved per host. When the window cannot fit the right column, plugins remain available through their original entries; the terminal stays below chat.

Node.js plugins still load and run in the existing engine. These entries reuse the original native panels, web views or web links, retaining their permissions, scope and display rules without a new plugin format.

## Colors

<!-- nav: commonSettings,hubSettingsInterface,terminalColorTitle -->
`Settings › Interface › Terminal colors`

Classic black is the default; Deep blue is also available. Changes apply immediately to both the panel and fullscreen view without restarting terminal processes.

## Tabs

- Opening the page restores the terminals kept on the host one by one; if there is none, it starts a new one.
- Each tab is a separate terminal on the host. It stays on the host; closing the phone page doesn't stop it.
- Leaving the page only disconnects the view: commands keep running on the host, and coming back reattaches.
- Closing a tab ends its process. A tab whose process has exited stays ended and does not restart on its own.

## Keys

The key row above the keyboard sends the terminal's common control keys, such as interrupt, exit, completion and arrow keys. For a modifier combination, tap the modifier first, then the key.

## Notes

- Commands run as the host's user and can read and write files there; the app doesn't ask you to confirm each command.
- If a remote host disconnects, its terminal keeps running; reconnect and open the page to attach again.
- Stopping or resetting the on-device engine also ends the processes in its terminals.

Related: [Engine and remote hosts](03-engine-hosts.md).
