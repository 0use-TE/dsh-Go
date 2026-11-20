import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/hosts_state.dart';
import '../../state/terminal_state.dart';
import '../shell/adaptive/adaptive_layout.dart';
import '../shell/adaptive/adaptive_scaffold.dart';
import 'terminal_page.dart';
import 'terminal_dock_scope.dart';

/// A dedicated terminal beneath the conversation. The right panel is independent.
class TerminalDockLayout extends ConsumerStatefulWidget {
  const TerminalDockLayout({
    super.key,
    required this.sessionId,
    required this.layout,
    required this.animate,
    required this.body,
    required this.sidebar,
    required this.rail,
    required this.panel,
    this.enabled = true,
    this.onPanelResize,
    this.onPanelResizeEnd,
  });
  final String? sessionId;
  final AdaptiveLayout layout;
  final bool animate;
  final bool enabled;
  final ValueChanged<double>? onPanelResize;
  final VoidCallback? onPanelResizeEnd;
  final Widget body;
  final Widget sidebar;
  final Widget rail;
  final Widget? panel;
  @override
  ConsumerState<TerminalDockLayout> createState() => _TerminalDockLayoutState();
}

class _TerminalDockLayoutState extends ConsumerState<TerminalDockLayout> {
  bool _shown = false;
  // Hold from the opening key event onward, including before the first frame.
  // Closing the dock keeps PTYs/buffers; changing conversation/host releases it.
  ProviderSubscription<TerminalWorkspaceState>? _terminalHold;
  double _fraction = .42;
  FocusNode? _previousFocus;
  final _bodyKey = GlobalKey();
  final _terminalKey = GlobalKey<TerminalPageState>();

  @override
  void initState() {
    super.initState();
    FocusManager.instance.addEarlyKeyEventHandler(_shortcut);
  }

  @override
  void dispose() {
    FocusManager.instance.removeEarlyKeyEventHandler(_shortcut);
    _terminalHold?.close();
    super.dispose();
  }

  // Run before focused editors/terminal/plugin controls can consume the keys.
  KeyEventResult _shortcut(KeyEvent event) {
    if (!mounted || widget.sessionId == null || !widget.enabled || ModalRoute.of(context)?.isCurrent == false) {
      return KeyEventResult.ignored;
    }
    final keyboard = HardwareKeyboard.instance;
    final command = terminalCommandFor(event);
    final index =
        keyboard.isControlPressed && !keyboard.isShiftPressed && !keyboard.isAltPressed && !keyboard.isMetaPressed
        ? terminalNumberKeys.indexOf(event.logicalKey)
        : -1;
    if (command == null && index < 0) return KeyEventResult.ignored;
    final page = _terminalKey.currentState;
    if ((command == TerminalCommand.close || command == TerminalCommand.split) && page?.hasInputFocus != true) {
      return KeyEventResult.ignored;
    }
    if (event is KeyDownEvent) {
      switch (command) {
        case TerminalCommand.toggle:
          _toggle();
        case TerminalCommand.create:
          _newTerminal();
        case TerminalCommand.close:
          page!.closeActiveTerminal();
        case TerminalCommand.split:
          page!.splitActiveTerminal();
        case null:
          _selectTerminal(index);
      }
    }
    return KeyEventResult.handled;
  }

  void _newTerminal() {
    if (!_shown) _toggle();
    ref.read(terminalWorkspaceProvider(widget.sessionId!).notifier).newTerminal();
    _terminalKey.currentState?.focusActiveTerminal();
  }

  void _selectTerminal(int index) {
    if (!widget.enabled || ModalRoute.of(context)?.isCurrent == false) return;
    if (_shown) {
      _terminalKey.currentState?.selectTab(index);
      return;
    }
    _toggle();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _terminalKey.currentState?.selectTab(index);
    });
  }

  @override
  void didUpdateWidget(TerminalDockLayout oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.sessionId != widget.sessionId) _reset();
  }

  void _reset() {
    _shown = false;
    _terminalHold?.close();
    _terminalHold = null;
    _previousFocus = null;
  }

  void _hide() {
    FocusManager.instance.primaryFocus?.unfocus();
    setState(() => _shown = false);
    if (_previousFocus?.context != null && _previousFocus!.canRequestFocus) _previousFocus!.requestFocus();
  }

  void _toggle() {
    if (!widget.enabled || ModalRoute.of(context)?.isCurrent == false) return;
    if (_shown) {
      _hide();
    } else {
      _previousFocus = FocusManager.instance.primaryFocus;
      _terminalHold ??= ref.listenManual(terminalWorkspaceProvider(widget.sessionId!), (_, _) {});
      setState(() {
        _shown = true;
      });
    }
  }

  Widget _dock(Widget above) => AnimatedBuilder(
    animation: ModalRoute.of(context)?.secondaryAnimation ?? kAlwaysDismissedAnimation,
    builder: (context, _) => LayoutBuilder(
      builder: (context, constraints) {
        final bottom = MediaQuery.viewInsetsOf(context).bottom;
        final safeBottom = bottom == 0 ? MediaQuery.paddingOf(context).bottom : 0.0;
        final height = constraints.maxHeight - bottom - safeBottom;
        final onPage = ModalRoute.of(context)?.secondaryAnimation?.isDismissed ?? true;
        final open = _shown && height >= 360 && onPage;
        final dockHeight = (height * _fraction).clamp(180.0, (height - 160).clamp(180.0, double.infinity));
        return Padding(
          padding: EdgeInsets.only(bottom: open ? bottom + safeBottom : 0),
          child: MediaQuery.removeViewInsets(
            context: context,
            removeBottom: open,
            child: Column(
              children: [
                Expanded(child: above),
                if (open) ...[
                  MouseRegion(
                    cursor: SystemMouseCursors.resizeRow,
                    child: GestureDetector(
                      key: const ValueKey('terminal-dock-divider'),
                      behavior: HitTestBehavior.opaque,
                      onVerticalDragUpdate: (d) =>
                          setState(() => _fraction = ((dockHeight - d.delta.dy) / height).clamp(.2, .7)),
                      child: SizedBox(
                        height: 12,
                        child: Center(
                          child: Container(
                            height: 1,
                            margin: const EdgeInsets.symmetric(horizontal: 8),
                            color: Theme.of(context).colorScheme.outlineVariant,
                          ),
                        ),
                      ),
                    ),
                  ),
                  SizedBox(
                    height: dockHeight,
                    child: TerminalPage(key: _terminalKey, sessionId: widget.sessionId!, onHide: _hide),
                  ),
                ],
              ],
            ),
          ),
        );
      },
    ),
  );

  @override
  Widget build(BuildContext context) {
    final id = widget.sessionId;
    ref.listen(activeHostProvider, (_, _) => setState(_reset));
    final body = KeyedSubtree(key: _bodyKey, child: widget.body);
    final scaffold = AdaptiveScaffold(
      layout: widget.layout,
      animate: widget.animate,
      body: id == null ? body : _dock(body),
      sidebar: widget.sidebar,
      rail: widget.rail,
      panel: widget.panel,
      onPanelResize: widget.enabled ? widget.onPanelResize : null,
      onPanelResizeEnd: widget.onPanelResizeEnd,
    );
    if (id == null) return scaffold;
    return TerminalDockScope(
      toggle: _toggle,
      child: Focus(autofocus: true, child: scaffold),
    );
  }
}
