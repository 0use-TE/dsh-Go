import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart' show listEquals;
import 'package:flutter/gestures.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../l10n/l10n.dart';
import '../../../state/hosts_state.dart';
import '../../../state/workspace_panels_state.dart';
import '../../chat/chat_header.dart';
import '../../shell/adaptive/detail_panel_keys.dart';
import '../../shell/page_frame.dart' show GlassIconButton;
import '../../terminal/terminal_dock_scope.dart';
import '../../terminal/terminal_page.dart';
import '../../theme/app_icons.dart';
import 'workspace_panel_body.dart';
import 'workspace_tab_strip.dart';

class _PanelDrag {
  const _PanelDrag(this.key, this.host, this.session);
  final String key;
  final HostRef host;
  final String session;
}

/// Mouse/trackpad clicks drag immediately; touch keeps scrolling until held.
class _TabDraggable extends Draggable<_PanelDrag> {
  const _TabDraggable({
    required super.data,
    required super.feedback,
    required super.child,
    super.childWhenDragging,
    super.onDragStarted,
    super.onDragEnd,
    this.touch = false,
  }) : super(dragAnchorStrategy: pointerDragAnchorStrategy);
  final bool touch;

  @override
  MultiDragGestureRecognizer createRecognizer(GestureMultiDragStartCallback onStart) =>
      (touch
            ? DelayedMultiDragGestureRecognizer(
                supportedDevices: const {
                  PointerDeviceKind.touch,
                  PointerDeviceKind.stylus,
                  PointerDeviceKind.invertedStylus,
                },
              )
            : ImmediateMultiDragGestureRecognizer(supportedDevices: const {PointerDeviceKind.mouse}))
        ..onStart = onStart;
}

/// First-level detail/plugin tabs, with at most two exclusive vertical groups.
class RightWorkspacePanel extends ConsumerStatefulWidget {
  const RightWorkspacePanel({super.key, required this.sessionId, required this.details});
  final String sessionId;
  final Widget details;
  @override
  ConsumerState<RightWorkspacePanel> createState() => _RightWorkspacePanelState();
}

class _RightWorkspacePanelState extends ConsumerState<RightWorkspacePanel> {
  double _fraction = .4;
  _PanelDrag? _dragged;
  List<String>? _previewOrder;
  bool _previewBelow = false;
  String _topSelected = workspaceDetailsKey;
  final _detailsKey = GlobalKey();

  String get _hostKey {
    final host = ref.read(activeHostProvider);
    return '${host.kind.name}:${host.id}';
  }

  WorkspacePanelPrefsController get _prefs => ref.read(workspacePanelPrefsProvider(_hostKey).notifier);

  @override
  void didUpdateWidget(RightWorkspacePanel oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.sessionId != widget.sessionId) _reset();
  }

  void _reset() {
    _dragged = null;
    _previewOrder = null;
    _topSelected = workspaceDetailsKey;
  }

  Future<void> _save(Future<void> action) async {
    try {
      await action;
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(context.l10n.workspaceSaveFailed)));
      }
    }
  }

  void _select(String key, {required bool below}) {
    ref
        .read(rightWorkspaceTabProvider((ref.read(activeHostProvider), widget.sessionId)).notifier)
        .select(key == workspaceDetailsKey ? null : key);
    if (below) {
      _save(_prefs.select(key));
    } else {
      _topSelected = key;
    }
  }

  void _move(_PanelDrag drag, List<String> bottom) {
    if (drag.host != ref.read(activeHostProvider) || drag.session != widget.sessionId) return;
    _select(drag.key, below: false);
    _save(_prefs.arrange(bottom, selected: drag.key));
  }

  bool _valid(_PanelDrag drag) => drag.host == ref.read(activeHostProvider) && drag.session == widget.sessionId;

  void _reorder(_PanelDrag drag, String anchor, bool after, bool below, List<String> allKeys, List<String> bottom) {
    if (!_valid(drag)) return;
    final top = allKeys.where((key) => !bottom.contains(key) && key != drag.key).toList();
    final lower = bottom.where((key) => key != drag.key).toList();
    final target = below ? lower : top;
    if (_previewOrder != null && _previewBelow == below) {
      target
        ..clear()
        ..addAll(_previewOrder!);
    } else {
      target.insert(target.indexOf(anchor) + (after ? 1 : 0), drag.key);
    }
    _select(drag.key, below: false);
    _save(_prefs.arrange(top.isEmpty ? [] : lower, selected: drag.key, order: [...top, ...lower]));
  }

  bool _after(String key, Offset offset) {
    final box = _tabKeys[key]!.currentContext!.findRenderObject()! as RenderBox;
    return box.globalToLocal(offset).dx > box.size.width / 2;
  }

  void _preview(_PanelDrag drag, String anchor, Offset offset, bool below, List<String> allKeys, List<String> bottom) {
    final keys = below ? bottom : allKeys.where((key) => !bottom.contains(key)).toList();
    // Reordering previews belong to the source group; cross-group drops move on release.
    if (!keys.contains(drag.key) || anchor == drag.key) return;
    final next = keys.where((key) => key != drag.key).toList();
    next.insert(next.indexOf(anchor) + (_after(anchor, offset) ? 1 : 0), drag.key);
    if (_previewBelow == below && listEquals(_previewOrder, next)) return;
    setState(() {
      _previewOrder = next;
      _previewBelow = below;
    });
  }

  Widget _tab(String key, String title, bool selected, bool below, List<String> allKeys, List<String> bottom) {
    final tab = Padding(
      padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 4),
      child: Center(
        child: TextButton(
          key: ValueKey(
            key == workspaceDetailsKey ? 'workspace-details-tab' : 'workspace-${below ? 'dock' : 'main'}-$key',
          ),
          onPressed: () => _select(key, below: below),
          style: TextButton.styleFrom(
            minimumSize: const Size(48, 36),
            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            backgroundColor: selected ? Theme.of(context).colorScheme.secondaryContainer : Colors.transparent,
          ),
          child: Text(title, maxLines: 1, overflow: TextOverflow.ellipsis),
        ),
      ),
    );
    final data = _PanelDrag(key, ref.read(activeHostProvider), widget.sessionId);
    final feedback = Material(
      elevation: 6,
      borderRadius: BorderRadius.circular(8),
      color: Theme.of(context).colorScheme.secondaryContainer,
      child: Padding(padding: const EdgeInsets.all(12), child: Text(title)),
    );
    void started() => setState(() => _dragged = data);
    void ended(DraggableDetails _) {
      if (mounted) {
        setState(() {
          _dragged = null;
          _previewOrder = null;
        });
      }
    }

    return DragTarget<_PanelDrag>(
      key: ValueKey('workspace-reorder-$key'),
      onWillAcceptWithDetails: (d) {
        if (!_valid(d.data) || d.data.key == key) return false;
        _preview(d.data, key, d.offset, below, allKeys, bottom);
        return true;
      },
      onMove: (d) => _preview(d.data, key, d.offset, below, allKeys, bottom),
      onAcceptWithDetails: (d) {
        final after = _after(key, d.offset);
        _reorder(d.data, key, after, below, allKeys, bottom);
      },
      builder: (context, candidates, _) => KeyedSubtree(
        key: _tabKeys.putIfAbsent(key, GlobalKey.new),
        child: _TabDraggable(
          data: data,
          feedback: feedback,
          onDragStarted: started,
          onDragEnd: ended,
          childWhenDragging: Opacity(opacity: .35, child: tab),
          child: _TabDraggable(
            touch: true,
            data: data,
            feedback: feedback,
            onDragStarted: started,
            onDragEnd: ended,
            childWhenDragging: Opacity(opacity: .35, child: tab),
            child: Tooltip(triggerMode: TooltipTriggerMode.manual, message: context.l10n.workspaceDragHint, child: tab),
          ),
        ),
      ),
    );
  }

  final _tabKeys = <String, GlobalKey>{};

  Widget _header(
    List<String> keys,
    String selected,
    Map<String, WorkspacePanelEntry> entries, {
    required bool below,
    required List<String> allKeys,
    required List<String> bottom,
  }) {
    return Padding(
      padding: EdgeInsets.only(left: 12, right: 12, top: below ? 0 : MediaQuery.paddingOf(context).top),
      child: SizedBox(
        height: ChatHeader.barHeightOf(context),
        child: Row(
          children: [
            Expanded(
              child: DragTarget<_PanelDrag>(
                onWillAcceptWithDetails: (d) => _valid(d.data) && keys.contains(d.data.key),
                onAcceptWithDetails: (d) {
                  if (_previewOrder != null && _previewBelow == below) {
                    _reorder(d.data, d.data.key, false, below, allKeys, bottom);
                  }
                },
                builder: (context, _, _) => WorkspaceTabStrip(
                  keys: keys,
                  titles: {
                    for (final key in keys)
                      key: key == workspaceDetailsKey ? context.l10n.hubSessionDetails : entries[key]!.title,
                  },
                  preview: _previewOrder != null && _previewBelow == below ? _previewOrder : null,
                  itemBuilder: (key) => _tab(
                    key,
                    key == workspaceDetailsKey ? context.l10n.hubSessionDetails : entries[key]!.title,
                    key == selected,
                    below,
                    allKeys,
                    bottom,
                  ),
                ),
              ),
            ),
            if (!below) ...[
              GlassIconButton(
                key: const ValueKey('workspace-terminal-toggle'),
                icon: AppIcons.terminal,
                tooltip: context.l10n.hubTerminal,
                onPressed: () {
                  final dock = TerminalDockScope.maybeOf(context);
                  if (dock != null) {
                    dock.toggle();
                  } else {
                    Navigator.of(context).push(TerminalPage.route(widget.sessionId));
                  }
                },
              ),
              const DetailPanelCollapseKey(),
            ],
          ],
        ),
      ),
    );
  }

  Widget _target(String name, List<String> Function(_PanelDrag) destination) => DragTarget<_PanelDrag>(
    key: ValueKey('workspace-drop-$name'),
    onWillAcceptWithDetails: (d) => d.data.host == ref.read(activeHostProvider) && d.data.session == widget.sessionId,
    onAcceptWithDetails: (d) => _move(d.data, destination(d.data)),
    builder: (context, candidates, _) => AnimatedContainer(
      duration: const Duration(milliseconds: 120),
      alignment: Alignment.center,
      margin: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.primary.withValues(alpha: candidates.isEmpty ? .08 : .24),
        border: Border.all(color: Theme.of(context).colorScheme.primary.withValues(alpha: .5)),
        borderRadius: BorderRadius.circular(8),
      ),
    ),
  );

  Widget _group(
    List<String> keys,
    String selected,
    Map<String, WorkspacePanelEntry> entries, {
    required bool below,
    required List<String> allKeys,
    required List<String> bottom,
    required bool onPage,
  }) {
    final active = entries[selected];
    final split = bottom.isNotEmpty;
    return Column(
      key: ValueKey('workspace-${below ? 'bottom' : 'top'}-group'),
      children: [
        _header(keys, selected, entries, below: below, allKeys: allKeys, bottom: bottom),
        Expanded(
          child: Stack(
            fit: StackFit.expand,
            children: [
              MediaQuery.removePadding(
                context: context,
                removeTop: true,
                child: IndexedStack(
                  index: selected == workspaceDetailsKey ? 0 : 1,
                  children: [
                    if (keys.contains(workspaceDetailsKey))
                      TickerMode(
                        enabled: selected == workspaceDetailsKey,
                        child: ExcludeFocus(
                          excluding: selected != workspaceDetailsKey,
                          child: KeyedSubtree(key: _detailsKey, child: widget.details),
                        ),
                      )
                    else
                      const SizedBox.shrink(),
                    if (active != null && onPage)
                      WorkspacePanelBody(
                        key: ValueKey('workspace-view-${active.key}'),
                        request: active.request(widget.sessionId, viewId: 'right-workspace'),
                      )
                    else
                      const SizedBox.shrink(),
                  ],
                ),
              ),
              if (_dragged != null)
                if (split)
                  _target(below ? 'bottom' : 'top', (d) {
                    final next = below
                        ? [...bottom.where((key) => key != d.key), d.key]
                        : bottom.where((key) => key != d.key).toList();
                    return next.length == allKeys.length ? [] : next;
                  })
                else
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Expanded(child: _target('above', (d) => allKeys.where((key) => key != d.key).toList())),
                      Expanded(child: _target('below', (d) => allKeys.length > 1 ? [d.key] : [])),
                    ],
                  ),
            ],
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final host = ref.watch(activeHostProvider);
    ref.listen(activeHostProvider, (_, _) => setState(_reset));
    final entries = ref.watch(independentWorkspaceEntriesProvider(widget.sessionId));
    final prefs = ref.watch(workspacePanelPrefsProvider('${host.kind.name}:${host.id}'));
    final selected = ref.watch(rightWorkspaceTabProvider((host, widget.sessionId))) ?? workspaceDetailsKey;
    final byKey = {for (final entry in entries) entry.key: entry};
    final available = [workspaceDetailsKey, ...byKey.keys];
    final allKeys = [...prefs.order.where(available.contains), ...available.where((key) => !prefs.order.contains(key))];
    var bottom = prefs.pins.where(allKeys.contains).toList();
    if (bottom.length == allKeys.length) bottom = [];
    final top = allKeys.where((key) => !bottom.contains(key)).toList();
    final topSelected = top.contains(selected)
        ? selected
        : top.contains(_topSelected)
        ? _topSelected
        : top.first;
    final bottomSelected = bottom.contains(selected)
        ? selected
        : bottom.contains(prefs.selected)
        ? prefs.selected!
        : bottom.firstOrNull;
    return AnimatedBuilder(
      animation: ModalRoute.of(context)?.secondaryAnimation ?? kAlwaysDismissedAnimation,
      builder: (context, _) => LayoutBuilder(
        builder: (context, constraints) {
          final safeBottom = MediaQuery.paddingOf(context).bottom;
          final height = constraints.maxHeight - safeBottom;
          final dockHeight = (height * _fraction).clamp(80.0, (height - 160).clamp(80.0, double.infinity));
          final onPage = ModalRoute.of(context)?.secondaryAnimation?.isDismissed ?? true;
          return Padding(
            padding: EdgeInsets.only(bottom: safeBottom),
            child: Column(
              children: [
                Expanded(
                  child: _group(
                    top,
                    topSelected,
                    byKey,
                    below: false,
                    allKeys: allKeys,
                    bottom: bottom,
                    onPage: onPage,
                  ),
                ),
                if (bottomSelected != null) ...[
                  MouseRegion(
                    cursor: SystemMouseCursors.resizeRow,
                    child: GestureDetector(
                      key: const ValueKey('workspace-dock-divider'),
                      behavior: HitTestBehavior.opaque,
                      onVerticalDragUpdate: (d) =>
                          setState(() => _fraction = ((dockHeight - d.delta.dy) / height).clamp(.2, .65)),
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
                    child: _group(
                      bottom,
                      bottomSelected,
                      byKey,
                      below: true,
                      allKeys: allKeys,
                      bottom: bottom,
                      onPage: onPage,
                    ),
                  ),
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}
