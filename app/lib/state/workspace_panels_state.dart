import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../plugins/seams/seams.dart';
import 'hosts_state.dart';

/// Shared with original detail entries, so opening files/progress can reveal
/// details even when its inner tab was already selected before a plugin tab.
class RightWorkspaceTabController extends Notifier<String?> {
  @override
  String? build() => null;
  void select(String? key) => state = key;
}

final rightWorkspaceTabProvider = NotifierProvider.autoDispose
    .family<RightWorkspaceTabController, String?, (HostRef, String)>((_) => RightWorkspaceTabController());

/// The original seat is retained, including its global/conversation scope.
class WorkspacePanelEntry {
  const WorkspacePanelEntry({
    required this.slot,
    required this.package,
    required this.cell,
    required this.title,
    required this.sessionScoped,
  });
  final String slot;
  final String package;
  final String cell;
  final String title;
  final bool sessionScoped;
  String get key => jsonEncode([slot, package, cell]);
  SeatRequest request(String sessionId, {String? viewId}) => SeatRequest(
    slot: slot,
    package: package,
    cell: cell,
    placement: SeatPlacement.page,
    viewId: viewId,
    sessionId: sessionScoped ? sessionId : null,
  );
}

/// Additional entries for the original plugin pages. The same planner chooses
/// native panels, web islands or web links, with the original scope and gates.
final workspacePanelEntriesProvider = Provider.autoDispose.family<List<WorkspacePanelEntry>, String>((ref, id) {
  final seen = <(String, String, String)>{};
  final entries = <WorkspacePanelEntry>[];
  final inventory = ref.watch(seatInventoryProvider);
  for (final (slot, sessionScoped) in [
    (Slots.rightPaneTab, true),
    (Slots.conversationView, true),
    (Slots.main, false),
    (Slots.dshGoPanel, true),
  ]) {
    final plan = ref.watch(
      seatPlanProvider(SeatRequest(slot: slot, placement: SeatPlacement.page, sessionId: sessionScoped ? id : null)),
    );
    for (final item in plan.visible) {
      final o = item.occupant;
      if (slot == Slots.dshGoPanel) {
        final nativeId = SeatInventory.nativePanelId(o.cell);
        final panel = inventory?.nativePanels.where((p) => p.package == o.package && p.id == nativeId).firstOrNull;
        // A session/main override must not be bypassed through the synthetic seat.
        if (panel == null || panel.placement.contains('session.tab') || panel.placement.contains('features')) continue;
      }
      if (!seen.add((SeatInventory.nativePanelId(o.cell) == null ? slot : 'native', o.package, o.cell))) {
        continue;
      }
      final labels =
          inventory
              ?.occupantsFor(slot == Slots.main ? Slots.panelList : Slots.rightPaneTabTitle)
              .where((title) => title.package == o.package)
              .toList() ??
          const <SlotOccupant>[];
      final label =
          labels.where((title) => title.cell == o.cell).firstOrNull?.label ??
          (labels.length == 1 ? labels.single.label : null);
      entries.add(
        WorkspacePanelEntry(
          slot: slot,
          package: o.package,
          cell: o.cell,
          title: o.label ?? label ?? o.package,
          sessionScoped: sessionScoped,
        ),
      );
    }
  }
  return entries;
});

class WorkspacePanelPrefs {
  const WorkspacePanelPrefs({this.pins = const [], this.order = const [], this.selected});
  final List<String> order;
  final List<String> pins;
  final String? selected;
}

/// The lower group's keys are the only ownership list. Every other entry
/// belongs to the upper group, so a panel can never appear in both groups.
const workspaceDetailsKey = '@details';

/// Local layout only, separated by host. Moving tabs never disables a plugin.
class WorkspacePanelPrefsController extends Notifier<WorkspacePanelPrefs> {
  WorkspacePanelPrefsController(this.hostKey);
  final String hostKey;
  String get storageKey => 'workspace.rightDock.$hostKey';
  late Future<void> _loaded;
  Future<void> _writes = Future<void>.value();

  @override
  WorkspacePanelPrefs build() {
    _loaded = _load();
    return const WorkspacePanelPrefs();
  }

  Future<void> get ready => _loaded;

  Future<void> _load() async {
    try {
      final raw = (await SharedPreferences.getInstance()).getString(storageKey);
      if (raw == null) return;
      final json = jsonDecode(raw) as Map<String, dynamic>;
      final pins = <String>[];
      for (final item in json['pins'] as List? ?? const []) {
        if (item is String && !pins.contains(item)) pins.add(item);
      }
      if (ref.mounted) {
        state = WorkspacePanelPrefs(
          pins: List.unmodifiable(pins),
          order: List.unmodifiable((json['order'] as List? ?? const []).whereType<String>().toSet()),
          selected: json['selected'] as String?,
        );
      }
    } on FormatException {
      // Invalid saved layout can be replaced by the next explicit move.
    } on TypeError {
      // A saved layout from an incompatible format is ignored.
    }
  }

  Future<void> _change(WorkspacePanelPrefs Function(WorkspacePanelPrefs) change) {
    final write = _writes.then((_) async {
      await _loaded;
      if (!ref.mounted) return;
      final next = change(state);
      final saved = await (await SharedPreferences.getInstance()).setString(
        storageKey,
        jsonEncode({'pins': next.pins, 'order': next.order, 'selected': next.selected}),
      );
      if (!saved) throw StateError('workspace_panels_save_failed');
      if (ref.mounted) state = next;
    });
    _writes = write.then<void>((_) {}, onError: (Object _, StackTrace _) {});
    return write;
  }

  Future<void> arrange(List<String> bottom, {required String selected, List<String>? order}) => _change(
    (s) => WorkspacePanelPrefs(
      pins: List.unmodifiable(bottom.toSet()),
      order: order == null ? s.order : List.unmodifiable(order.toSet()),
      selected: selected,
    ),
  );

  Future<void> select(String key) => _change((s) => WorkspacePanelPrefs(pins: s.pins, order: s.order, selected: key));
}

final workspacePanelPrefsProvider = NotifierProvider.family<WorkspacePanelPrefsController, WorkspacePanelPrefs, String>(
  WorkspacePanelPrefsController.new,
);

class PluginDisplayPreference {
  const PluginDisplayPreference({required this.name, required this.independent});
  final String name;
  final bool independent;
}

/// App-local placement, keyed by package identity rather than translated title.
/// Missing entries stay in the conversation details navigation.
class PluginDisplayController extends Notifier<Map<String, PluginDisplayPreference>> {
  PluginDisplayController(this.host);
  final HostRef host;
  String get storageKey => 'workspace.pluginDisplay.${host.kind.name}:${host.id}';
  late Future<void> _loaded;
  Future<void> _writes = Future<void>.value();

  @override
  Map<String, PluginDisplayPreference> build() {
    _loaded = _load();
    return const {};
  }

  Future<void> get ready => _loaded;

  Future<void> _load() async {
    try {
      final raw = (await SharedPreferences.getInstance()).getString(storageKey);
      if (raw == null) return;
      final json = jsonDecode(raw) as Map<String, dynamic>;
      final values = {
        for (final entry in json.entries)
          entry.key: PluginDisplayPreference(
            name: (entry.value as Map<String, dynamic>)['name'] as String,
            independent: entry.value['independent'] as bool,
          ),
      };
      if (ref.mounted) state = Map.unmodifiable(values);
    } on FormatException {
      // A malformed preference can be replaced by the next explicit choice.
    } on TypeError {
      // Ignore incompatible saved preference formats.
    }
  }

  Future<void> setIndependent(String package, String name, bool independent) {
    final write = _writes.then((_) async {
      await _loaded;
      final next = {...state, package: PluginDisplayPreference(name: name, independent: independent)};
      final saved = await (await SharedPreferences.getInstance()).setString(
        storageKey,
        jsonEncode({
          for (final e in next.entries) e.key: {'name': e.value.name, 'independent': e.value.independent},
        }),
      );
      if (!saved) throw StateError('plugin_display_save_failed');
      if (ref.mounted) state = Map.unmodifiable(next);
    });
    _writes = write.then<void>((_) {}, onError: (Object _, StackTrace _) {});
    return write;
  }
}

final pluginDisplayProvider =
    NotifierProvider.family<PluginDisplayController, Map<String, PluginDisplayPreference>, HostRef>(
      PluginDisplayController.new,
    );

final independentWorkspaceEntriesProvider = Provider.autoDispose.family<List<WorkspacePanelEntry>, String>((ref, id) {
  final preferences = ref.watch(pluginDisplayProvider(ref.watch(activeHostProvider)));
  return ref
      .watch(workspacePanelEntriesProvider(id))
      .where((entry) => preferences[entry.package]?.independent ?? false)
      .toList();
});
