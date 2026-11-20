# Terminal

The conversation's terminal: run commands in the same workspace the agent uses. Commands run on the host — the on-device engine on this phone, or a remote host on your computer or server.

The terminal belongs to the open conversation, so open one first.

<!-- nav: catalogAllFeatures,catalogTerminal -->
`All features › Terminal`

The page shows **Terminal** over the current directory, a row of tabs, the terminal below, and a key row above the keyboard.

## Terminal panel in a conversation

The terminal stays below chat and does not host plugins. Click the terminal icon beside the send/voice button at the right of the message box, or the terminal button at the upper right, to show or hide it. Ctrl + backquote on a hardware keyboard also toggles it. The hidden panel occupies no space; the open panel has no extra title bar. Drag the separating gap to adjust its height. Compact terminal tabs run horizontally above the terminal and scroll horizontally when needed; the new-terminal button stays at the right of the tab bar. Right-click or hold a tab to open a context menu at the pointer with Rename and Delete. Deleting a running terminal still asks for confirmation. Ctrl + 1–9 selects the corresponding terminal, reopening the panel when hidden. The original fullscreen terminal remains in All features. Shortcuts run before focused chat, terminal or native plugin controls within the current chat page. They pause for dialogs, other pages and overlay drawers. Ctrl + backquote also matches the physical key position when an IME or keyboard layout changes the logical key.

The panel omits the phone's extra key row; use hardware keyboard shortcuts directly. The fullscreen terminal retains the extra keys. Both views share the conversation's terminal tabs. Hiding the panel keeps terminals running and stops keyboard input; reopening restores their tabs and content. Use `+` to create terminals; closing a tab ends its process.

## Terminal shortcuts and side-by-side panes

| Shortcut | Action |
|---|---|
| Ctrl + backquote | Show/hide the terminal panel |
| Ctrl + Shift + backquote | Create and focus a terminal, opening the hidden panel first |
| Ctrl + Shift + W | Close the active terminal, retaining confirmation for running processes |
| Ctrl + Shift + 5 | Split right with a separate new terminal |
| Ctrl + 1–9 | Select the corresponding terminal |

Create and panel-toggle shortcuts work within the current chat workspace. Close and split require terminal focus, and pause for dialogs and overlay drawers. Splitting supports two side-by-side terminal groups. Each group has its own horizontal tab bar above its terminal, with a new-terminal button at the right, showing only its own terminals, with independent input, selection and scrolling. Click the content or a tab to select the active terminal. Drag the vertical separator to resize the panes. Pressing the split shortcut again while already split does not create another pane.

Right-click or hold a panel tab to choose Split right or Unsplit. Unsplit keeps the active terminal visible while the other continues running in its tab. Closing a tab first selects another terminal in the same group; the other pane expands only when the entire group becomes empty. Each group’s new-terminal button creates a terminal in that group, while the shortcut creates one in the focused group. Selecting a tab changes only its own group, leaving the other group intact. Hiding and reopening restores the split and its width; split layout is not saved after leaving the workspace.

## Right-side plugin tabs and splitting

By default, Conversation details retains the original Plugins navigation tab. Multiple plugin views appear as a list: select a view to open it. A single view uses the original direct display. Enable Show independently in an installed plugin’s details to move that plugin from the Plugins page to the outer right workspace on wide screens. Disable it to return the plugin to its original Plugins page. A plugin appears in only one of these places. Preferences are saved locally per host and package name; existing marketplace plugins keep the original entry and loading behavior by default. Narrow windows continue to use the original Plugins page. All features and plugin management remain available.

Click and drag a tab with a mouse or trackpad; on touchscreens, hold before dragging. Drop on the left or right of another outer tab to reorder, with adjacent tabs sliding aside. Drop it at the top or bottom of the content area to split the column into two groups; after splitting, drop it into the other group to move it. Conversation details can move too. Each tab belongs to one group only; moving the last tab out merges the groups. Drag the separator to resize. Drop previews show highlighted regions without instruction text. Layout and tab order are saved per host. Drag the vertical separator between chat and the right column to resize it; its width is remembered and chat keeps a minimum width. No resize handle is shown when the column is folded or cannot fit. Width limits adjust when the left list folds/unfolds or the window changes, without unexpectedly changing the left column during a drag. When the window cannot fit the right column, plugins remain available through their original entries; the terminal stays below chat.

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
