import 'dart:async';

import 'package:dsh_client/dsh_client.dart' show TerminalInfo;
import 'package:dsh_app/plugins/seams/seams.dart';
import 'package:dsh_app/state/adaptive_layout_state.dart';
import 'package:dsh_app/state/workspace_panels_state.dart';
import 'package:dsh_app/state/terminal_state.dart';
import 'package:dsh_app/state/hosts_state.dart';
import 'package:dsh_app/state/sessions_state.dart';
import 'package:dsh_app/ui/session/session_tab.dart';
import 'package:dsh_app/ui/shell/adaptive/open_detail.dart';
import 'package:dsh_app/ui/plugins/seats/right_workspace_panel.dart';
import 'package:dsh_app/ui/shell/adaptive/adaptive_layout.dart';
import 'package:dsh_app/ui/terminal/terminal_dock_layout.dart';
import 'package:dsh_app/ui/terminal/terminal_page.dart';
import 'package:dsh_app/ui/terminal/terminal_keys.dart';
import 'package:flutter/material.dart';
import 'package:flutter/gestures.dart';
import 'package:dsh_app/state/terminal_color_state.dart';
import 'package:dsh_app/ui/terminal/terminal_screen.dart';
import 'package:dsh_app/ui/chat/chat_screen.dart';
import 'package:dsh_app/ui/chat/composer.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:xterm/xterm.dart';

import '../shell/golden_harness.dart';
import '../chat/support/harness.dart' as chat;
import '../plugins/native/native_panel_test.dart' as panels;
import '../plugins/seats/support.dart' as seats;
import 'support.dart';

const _chat = ValueKey('dock-test-chat');
const _details = ValueKey('dock-test-details');

class _SelectedSession extends CurrentSessionController {
  @override
  String? build() => 's1';
}

class _SlowListing extends FakeTerminalBackend {
  _SlowListing() : super(terminals: [infoJson('a'), infoJson('b')]);
  final listed = Completer<void>();
  @override
  Future<List<TerminalInfo>> list() async {
    await listed.future;
    return super.list();
  }
}

Future<ProviderContainer> _pump(
  WidgetTester tester,
  FakeTerminalBackend backend, {
  List<Override> overrides = const [],
  bool plugins = false,
  Widget? body,
  bool enabled = true,
}) async {
  await tester.runAsync(loadGoldenFonts);
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = const Size(1280, 900);
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    goldenApp(
      brightness: Brightness.light,
      overrides: [
        currentSessionProvider.overrideWith(_SelectedSession.new),
        ...terminalOverrides(backend),
        ...overrides,
      ],
      home: Scaffold(
        body: Consumer(
          builder: (context, ref, _) => TerminalDockLayout(
            sessionId: 's1',
            enabled: enabled,
            animate: false,
            layout: AdaptiveLayout.resolve(
              window: MediaQuery.sizeOf(context),
              padding: EdgeInsets.zero,
              hasSession: true,
              sidebarOpen: false,
              panelOpen: ref.watch(layoutPrefsProvider).panelOpen,
            ),
            body: body ?? const Center(child: TextField(key: _chat)),
            sidebar: const SizedBox(),
            rail: const SizedBox(),
            panel: plugins
                ? const RightWorkspacePanel(
                    sessionId: 's1',
                    details: Center(child: Text('Details', key: _details)),
                  )
                : const Center(child: Text('Details', key: _details)),
          ),
        ),
      ),
    ),
  );
  await settleTerminal(tester);
  final container = ProviderScope.containerOf(tester.element(find.byType(TerminalDockLayout)));
  if (plugins) {
    for (final entry in container.read(workspacePanelEntriesProvider('s1'))) {
      await container
          .read(pluginDisplayProvider(HostRef.local).notifier)
          .setIndependent(entry.package, entry.title, true);
    }
    await settleTerminal(tester);
  }
  return container;
}

Future<void> _toggleKey(WidgetTester tester) async {
  await tester.sendKeyDownEvent(LogicalKeyboardKey.controlLeft);
  await tester.sendKeyEvent(LogicalKeyboardKey.backquote);
  await tester.sendKeyUpEvent(LogicalKeyboardKey.controlLeft);
  await settleTerminal(tester);
}

Future<void> _moveTab(
  WidgetTester tester,
  Finder tab,
  String target, {
  PointerDeviceKind kind = PointerDeviceKind.touch,
  bool hold = false,
}) async {
  final gesture = await tester.startGesture(tester.getCenter(tab), kind: kind);
  if (kind == PointerDeviceKind.touch) {
    await tester.pump(const Duration(milliseconds: 600));
  } else {
    if (hold) {
      await tester.pump(const Duration(milliseconds: 600));
    }
    await gesture.moveBy(const Offset(20, 0));
    await tester.pump(const Duration(milliseconds: 50));
  }
  expect(find.text('放到上方'), findsNothing);
  expect(find.text('放到下方'), findsNothing);
  expect(find.byKey(ValueKey('workspace-drop-$target')), findsOneWidget);
  await gesture.moveTo(tester.getCenter(find.byKey(ValueKey('workspace-drop-$target'))));
  await tester.pump(const Duration(milliseconds: 150));
  await gesture.up();
  await settleTerminal(tester);
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('global terminal shortcut beats a key-consuming plugin and matches the physical backquote', (
    tester,
  ) async {
    final focus = FocusNode();
    addTearDown(focus.dispose);
    final backend = FakeTerminalBackend();
    await _pump(
      tester,
      backend,
      body: Focus(focusNode: focus, onKeyEvent: (_, _) => KeyEventResult.handled, child: const SizedBox.expand()),
    );
    focus.requestFocus();
    await settleTerminal(tester);
    await _toggleKey(tester);
    expect(find.byType(TerminalView), findsOneWidget);
    await _toggleKey(tester);
    expect(find.byType(TerminalView), findsNothing);
    await tester.sendKeyDownEvent(LogicalKeyboardKey.controlLeft);
    await tester.sendKeyEvent(LogicalKeyboardKey.quote, physicalKey: PhysicalKeyboardKey.backquote);
    await tester.sendKeyUpEvent(LogicalKeyboardKey.controlLeft);
    await settleTerminal(tester);
    expect(find.byType(TerminalView), findsOneWidget);
    expect(backend.created, hasLength(1));
  });

  testWidgets('terminal shortcuts leave dialogs alone and are removed with the home workspace', (tester) async {
    final backend = FakeTerminalBackend();
    await _pump(tester, backend);
    final context = tester.element(find.byType(TerminalDockLayout));
    unawaited(
      showDialog<void>(
        context: context,
        builder: (_) => const AlertDialog(content: TextField()),
      ),
    );
    await settleTerminal(tester);
    await _toggleKey(tester);
    expect(backend.created, isEmpty);
    Navigator.of(context).pop();
    await settleTerminal(tester);
    await _toggleKey(tester);
    expect(backend.created, hasLength(1));
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: TextField())));
    await settleTerminal(tester);
    await _toggleKey(tester);
    expect(backend.created, hasLength(1));
    expect(tester.takeException(), isNull);
  });

  testWidgets('drawer overlay disables terminal shortcuts', (tester) async {
    final backend = FakeTerminalBackend();
    await _pump(tester, backend, enabled: false);
    await _toggleKey(tester);
    expect(backend.calls, isEmpty);
  });

  testWidgets('right-click delete confirms a running terminal and closes only that tab', (tester) async {
    final backend = FakeTerminalBackend(terminals: [infoJson('a'), infoJson('b')]);
    final container = await _pump(tester, backend);
    await _toggleKey(tester);
    await tester.tap(find.byKey(const ValueKey('terminal-tab-a')), buttons: kSecondaryMouseButton);
    await settleTerminal(tester);
    expect(find.text('重命名'), findsOneWidget);
    await tester.tap(find.text('删除'));
    await settleTerminal(tester);
    expect(backend.host, contains('a'));
    expect(find.byType(AlertDialog), findsOneWidget);
    await tester.tap(find.text('取消'));
    await settleTerminal(tester);
    expect(container.read(terminalWorkspaceProvider('s1')).tabs, hasLength(2));
    await tester.tap(find.byKey(const ValueKey('terminal-tab-a')), buttons: kSecondaryMouseButton);
    await settleTerminal(tester);
    await tester.tap(find.text('删除'));
    await settleTerminal(tester);
    await tester.tap(find.text('关闭').last);
    await settleTerminal(tester);
    expect(backend.host, isNot(contains('a')));
    expect(backend.host, contains('b'));
    expect(container.read(terminalWorkspaceProvider('s1')).tabs.single.id, 'b');
  });

  testWidgets('header close button confirms and closes only its terminal', (tester) async {
    final backend = FakeTerminalBackend(terminals: [infoJson('a'), infoJson('b')]);
    final container = await _pump(tester, backend);
    await _toggleKey(tester);
    expect(find.byKey(const ValueKey('terminal-tab-close-a')), findsOneWidget);
    expect(find.byKey(const ValueKey('terminal-tab-close-b')), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('terminal-tab-b')));
    await settleTerminal(tester);
    await tester.tap(find.byKey(const ValueKey('terminal-tab-close-b')));
    await settleTerminal(tester);
    expect(find.byType(AlertDialog), findsOneWidget);
    expect(backend.host, contains('b'));
    await tester.tap(find.text('关闭').last);
    await settleTerminal(tester);
    expect(backend.host, contains('a'));
    expect(backend.host, isNot(contains('b')));
    expect(container.read(terminalWorkspaceProvider('s1')).tabs.single.id, 'a');
    expect(find.byKey(const ValueKey('terminal-dock-hide')), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('long-press menu renames the targeted tab without replacing its terminal', (tester) async {
    final backend = FakeTerminalBackend(terminals: [infoJson('a'), infoJson('b')]);
    final container = await _pump(tester, backend);
    await _toggleKey(tester);
    await tester.longPress(find.byKey(const ValueKey('terminal-tab-b')));
    await settleTerminal(tester);
    expect(find.text('删除'), findsOneWidget);
    await tester.tap(find.text('重命名'));
    await settleTerminal(tester);
    final dialog = find.byType(AlertDialog);
    await tester.enterText(find.descendant(of: dialog, matching: find.byType(TextField)), 'dev server');
    await tester.tap(find.text('保存'));
    await settleTerminal(tester);
    final tabs = container.read(terminalWorkspaceProvider('s1')).tabs;
    expect(tabs.map((tab) => tab.id), ['a', 'b']);
    expect(tabs.singleWhere((tab) => tab.id == 'b').title, 'dev server');
    expect(backend.created, isEmpty);
    expect(tester.takeException(), isNull);
  });

  testWidgets('composer terminal button toggles the dock and keeps the draft and terminal', (tester) async {
    await chat.loadTestFonts();
    chat.usePhoneView(tester);
    final backend = FakeTerminalBackend();
    final harness = chat.ChatHarness(session: 's1');
    await tester.pumpWidget(
      chat.testApp(
        Builder(
          builder: (context) => TerminalDockLayout(
            sessionId: 's1',
            animate: false,
            layout: AdaptiveLayout.resolve(
              window: MediaQuery.sizeOf(context),
              padding: EdgeInsets.zero,
              hasSession: true,
              sidebarOpen: false,
              panelOpen: false,
            ),
            body: const ChatScreen(),
            sidebar: const SizedBox(),
            rail: const SizedBox(),
            panel: null,
          ),
        ),
        overrides: [...harness.overrides, ...terminalOverrides(backend)],
      ),
    );
    await chat.pumpFrames(tester);
    final input = find.descendant(of: find.byType(Composer), matching: find.byType(TextField));
    await tester.enterText(input, 'keep my draft');
    final button = find.byKey(const ValueKey('composer-terminal-toggle'));
    expect(tester.getSize(button), const Size.square(36));
    final composer = tester.getRect(find.byType(Composer));
    expect(tester.getCenter(button).dx, greaterThan(composer.center.dx));
    await tester.tap(button);
    await settleTerminal(tester);
    expect(find.byType(TerminalPage), findsOneWidget);
    expect(backend.created, hasLength(1));
    await tester.tap(button);
    await settleTerminal(tester);
    expect(find.byType(TerminalPage), findsNothing);
    expect(tester.widget<Composer>(find.byType(Composer)).controller.text, 'keep my draft');
    await tester.tap(button);
    await settleTerminal(tester);
    expect(backend.created, hasLength(1));
    expect(tester.takeException(), isNull);
  });

  testWidgets('terminal is lazy, preserves tabs and hidden output, and owns keyboard input only while open', (
    tester,
  ) async {
    final backend = FakeTerminalBackend();
    final container = await _pump(tester, backend);
    expect(backend.calls, isEmpty);
    expect(find.byKey(const ValueKey('terminal-dock-toggle')), findsNothing);
    expect(find.byType(TerminalPage), findsNothing);
    await tester.enterText(find.byKey(_chat), 'draft');
    await _toggleKey(tester);
    expect(backend.created, hasLength(1));
    expect(find.byType(ExtraKeysRow), findsNothing);
    expect(tester.widget<TerminalView>(find.byType(TerminalView)).focusNode!.hasFocus, isTrue);
    expect(find.byKey(const ValueKey('workspace-add-dock')), findsNothing);
    await tester.tap(find.byKey(const ValueKey('terminal-new')));
    await settleTerminal(tester);
    expect(backend.created, hasLength(2));
    final tabs = container.read(terminalWorkspaceProvider('s1')).tabs;
    final firstRect = tester.getRect(find.byKey(ValueKey('terminal-tab-${tabs.first.id}')));
    final secondRect = tester.getRect(find.byKey(ValueKey('terminal-tab-${tabs.last.id}')));
    expect(secondRect.top, greaterThanOrEqualTo(firstRect.bottom));
    expect(secondRect.left, firstRect.left);
    expect(firstRect.left, greaterThan(tester.getRect(find.byType(TerminalView)).right));
    expect(firstRect.top, tester.getRect(find.byType(TerminalCardFrame)).top);
    expect(tester.getSize(find.byKey(const ValueKey('terminal-dock-tabs'))).width, lessThan(90));
    expect(find.byKey(const ValueKey('terminal-dock-fullscreen')), findsNothing);
    final selected = container.read(terminalWorkspaceProvider('s1')).selected!;
    final attach = backend.attachOf(selected.id);
    await tester.sendKeyDownEvent(LogicalKeyboardKey.controlLeft);
    await tester.sendKeyEvent(LogicalKeyboardKey.keyC);
    await tester.sendKeyUpEvent(LogicalKeyboardKey.controlLeft);
    await settleTerminal(tester);
    expect(attach.written, '\x03');
    await _toggleKey(tester);
    expect(find.byType(TerminalView), findsNothing);
    expect(attach.cancelled, isFalse);
    attach.output('still running\r\n');
    await settleTerminal(tester);
    final lines = selected.terminal.buffer.lines;
    expect([for (var i = 0; i < lines.length; i++) lines[i].toString()].join('\n'), contains('still running'));
    await tester.sendKeyEvent(LogicalKeyboardKey.keyX, character: 'x');
    expect(attach.written, '\x03');
    await _toggleKey(tester);
    expect(container.read(terminalWorkspaceProvider('s1')).selected!.terminal, same(selected.terminal));
    expect(backend.created, hasLength(2));
    expect(find.textContaining('draft'), findsOneWidget);
  });

  testWidgets('terminal stays below chat, ignores old position, resizes and survives folding right details', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({'terminal_dock_position': 'details'});
    final backend = FakeTerminalBackend(terminals: [infoJson('a')]);
    final container = await _pump(tester, backend);
    await _toggleKey(tester);
    final model = container.read(terminalWorkspaceProvider('s1')).selected!.terminal;
    final pane = tester.getRect(find.byType(TerminalPage));
    expect(pane.left, lessThan(tester.getRect(find.byKey(_details)).left));
    expect(pane.top, greaterThan(tester.getRect(find.byKey(_chat)).bottom));
    final before = pane.height;
    await tester.drag(find.byKey(const ValueKey('terminal-dock-divider')), const Offset(0, -70));
    await settleTerminal(tester);
    expect(tester.getSize(find.byType(TerminalPage)).height, greaterThan(before));
    expect(backend.attachOf('a').resizes, isNotEmpty);
    await container.read(layoutPrefsProvider.notifier).setPanelOpen(false);
    await settleTerminal(tester);
    expect(find.byType(TerminalView), findsOneWidget);
    expect(container.read(terminalWorkspaceProvider('s1')).selected!.terminal, same(model));
  });

  testWidgets('upper-right terminal button toggles dock; original full-page entry still works', (tester) async {
    final backend = FakeTerminalBackend(terminals: [infoJson('a')]);
    final container = await _pump(tester, backend, plugins: true);
    await tester.tap(find.byKey(const ValueKey('workspace-terminal-toggle')));
    await settleTerminal(tester);
    expect(find.byType(TerminalView), findsOneWidget);
    expect(find.byType(ExtraKeysRow), findsNothing);
    expect(find.byKey(const ValueKey('terminal-back')), findsNothing);
    final model = container.read(terminalWorkspaceProvider('s1')).selected!.terminal;
    await tester.tap(find.byKey(const ValueKey('workspace-terminal-toggle')));
    await settleTerminal(tester);
    expect(find.byType(TerminalView), findsNothing);
    await _toggleKey(tester);
    Navigator.of(tester.element(find.byType(TerminalPage))).push(TerminalPage.route('s1'));
    await settleTerminal(tester);
    expect(find.byType(TerminalView), findsOneWidget);
    expect(find.byType(ExtraKeysRow), findsOneWidget);
    expect(container.read(terminalWorkspaceProvider('s1')).selected!.terminal, same(model));
    await tester.tap(find.byKey(const ValueKey('terminal-back')));
    await settleTerminal(tester);
    expect(find.byKey(const ValueKey('terminal-dock-hide')), findsOneWidget);
    expect(backend.attaches, hasLength(1));
  });

  testWidgets('unsupported message fits the dock at minimum height', (tester) async {
    await _pump(tester, FakeTerminalBackend(supported: false));
    await _toggleKey(tester);
    await tester.drag(find.byKey(const ValueKey('terminal-dock-divider')), const Offset(0, 500));
    await settleTerminal(tester);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a short landscape window still opens the embedded terminal', (tester) async {
    await _pump(tester, FakeTerminalBackend(), plugins: true);
    tester.view.physicalSize = const Size(1280, 420);
    await settleTerminal(tester);
    await _toggleKey(tester);
    expect(find.byType(TerminalPage), findsOneWidget);
    expect(find.byType(ExtraKeysRow), findsNothing);
    expect(find.byKey(const ValueKey('terminal-back')), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('right plugin tabs directly reuse live data and actions, independently of terminal', (tester) async {
    final backend = FakeTerminalBackend();
    final bridge = panels.usageBridge();
    final container = await _pump(
      tester,
      backend,
      plugins: true,
      overrides: panels.panelOverrides(bridge, panels.inventory()),
    );
    final entry = container.read(workspacePanelEntriesProvider('s1')).firstWhere((e) => e.cell == 'dsh-go:usage');
    await tester.tap(find.byKey(ValueKey('workspace-main-${entry.key}')));
    await settleTerminal(tester);
    expect(find.text('¥0.42'), findsOneWidget);
    expect(backend.calls, isEmpty);
    final sub = bridge.socket.subOf('usage')!;
    expect(sub['scope'], {'sessionId': 's1'});
    bridge.socket.push({
      't': 'patch',
      'sub': sub['sub'],
      'rev': 'r2',
      'base': 'r1',
      'merge': {'session': '¥0.50'},
    });
    await settleTerminal(tester);
    expect(find.text('¥0.50'), findsOneWidget);
    await tester.tap(find.text('清零'));
    await settleTerminal(tester);
    expect(bridge.invocations.single.action, 'reset');
    await _toggleKey(tester);
    expect(find.byType(TerminalView), findsOneWidget);
    expect(find.text('¥0.50'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('workspace-details-tab')));
    await settleTerminal(tester);
    expect(find.byKey(_details), findsOneWidget);
    expect(find.byType(TerminalView), findsOneWidget);
    container.read(sessionDetailTabProvider.notifier).select(SessionTab.files);
    await tester.tap(find.byKey(ValueKey('workspace-main-${entry.key}')));
    await settleTerminal(tester);
    openAdaptiveDetail(
      tester.element(find.byType(RightWorkspacePanel)),
      sessionId: 's1',
      tab: SessionTab.files,
      page: (_) => const SizedBox(),
      sheet: (_) => const SizedBox(),
    );
    await settleTerminal(tester);
    expect(
      container.read(rightWorkspaceTabProvider((HostRef.local, 's1'))),
      isNull,
      reason: 'the original entry reveals details even when its inner tab was already selected',
    );
    expect(find.byKey(_details), findsOneWidget);
    openAdaptiveDetail(
      tester.element(find.byType(RightWorkspacePanel)),
      sessionId: 's1',
      tab: SessionTab.plugins,
      page: (_) => const SizedBox(),
      sheet: (_) => const SizedBox(),
    );
    await settleTerminal(tester);
    expect(container.read(rightWorkspaceTabProvider((HostRef.local, 's1'))), entry.key);
    expect(container.read(sessionDetailTabProvider), SessionTab.files);
    expect(find.text('清零'), findsOneWidget);
  });

  testWidgets('hold and drag splits exclusively with equal headers and merges empty group', (tester) async {
    final bridge = panels.usageBridge();
    final backend = FakeTerminalBackend();
    final container = await _pump(
      tester,
      backend,
      plugins: true,
      overrides: panels.panelOverrides(bridge, panels.inventory()),
    );
    final entry = container.read(workspacePanelEntriesProvider('s1')).firstWhere((e) => e.cell == 'dsh-go:usage');
    final main = find.byKey(ValueKey('workspace-main-${entry.key}'));
    final dock = find.byKey(ValueKey('workspace-dock-${entry.key}'));
    expect(find.byKey(const ValueKey('workspace-bottom-group')), findsNothing);
    await _moveTab(tester, main, 'below');
    expect(main, findsNothing);
    expect(dock, findsOneWidget);
    expect(find.text('¥0.42'), findsOneWidget);
    expect(find.byKey(_details), findsOneWidget);
    expect(backend.calls, isEmpty);
    expect(find.byKey(const ValueKey('workspace-dock-menu')), findsNothing);
    expect(tester.getSize(dock).height, tester.getSize(find.byKey(const ValueKey('workspace-details-tab'))).height);
    final height = tester.getSize(find.byKey(const ValueKey('workspace-bottom-group'))).height;
    await tester.drag(find.byKey(const ValueKey('workspace-dock-divider')), const Offset(0, -50));
    await settleTerminal(tester);
    expect(tester.getSize(find.byKey(const ValueKey('workspace-bottom-group'))).height, greaterThan(height));
    await _moveTab(tester, dock, 'top');
    expect(find.byKey(const ValueKey('workspace-bottom-group')), findsNothing);
    expect(main, findsOneWidget);
    expect(find.text('¥0.42'), findsOneWidget);
    expect(container.read(seatPlanProvider(entry.request('s1'))).visible, hasLength(1));
    expect(tester.takeException(), isNull);
  });

  testWidgets('details can split above a plugin then move back, retaining its content', (tester) async {
    final container = await _pump(
      tester,
      FakeTerminalBackend(),
      plugins: true,
      overrides: panels.panelOverrides(panels.usageBridge(), panels.inventory()),
    );
    final entry = container.read(workspacePanelEntriesProvider('s1')).firstWhere((e) => e.cell == 'dsh-go:usage');
    await _moveTab(tester, find.byKey(ValueKey('workspace-main-${entry.key}')), 'above');
    expect(find.byKey(ValueKey('workspace-main-${entry.key}')), findsOneWidget);
    expect(find.byKey(ValueKey('workspace-dock-${entry.key}')), findsNothing);
    final detailsTab = find.byKey(const ValueKey('workspace-details-tab'));
    expect(
      tester.getRect(detailsTab).top,
      greaterThan(tester.getRect(find.byKey(const ValueKey('workspace-top-group'))).bottom),
    );
    final detailsElement = tester.element(find.byKey(_details));
    expect(find.text('¥0.42'), findsOneWidget);
    await _toggleKey(tester);
    await tester.tap(find.byKey(const ValueKey('terminal-new')));
    await settleTerminal(tester);
    await expectLater(find.byType(TerminalDockLayout), matchesGoldenFile('goldens/workspace_split.png'));
    await _moveTab(tester, detailsTab, 'top');
    expect(
      tester.getRect(detailsTab).top,
      lessThan(tester.getRect(find.byKey(const ValueKey('workspace-bottom-group'))).top),
    );
    expect(tester.element(find.byKey(_details)), same(detailsElement));
    expect(find.byType(TerminalView), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('moving a web tab renders one WebView and preserves original global scope', (tester) async {
    final container = await _pump(
      tester,
      FakeTerminalBackend(),
      plugins: true,
      overrides: seats.seatOverrides(
        inventory: seats.seatInventory(occupancy: seats.fullOccupancy),
        budget: const OpenIslandBudget(),
      ),
    );
    final entry = container.read(workspacePanelEntriesProvider('s1')).firstWhere((e) => e.slot == Slots.main);
    await tester.tap(find.byKey(ValueKey('workspace-main-${entry.key}')));
    await settleTerminal(tester);
    await _moveTab(tester, find.byKey(ValueKey('workspace-main-${entry.key}')), 'below');
    final specs = tester.widgetList<seats.FakeIsland>(find.byType(seats.FakeIsland)).map((i) => i.spec).toList();
    expect(specs, hasLength(1));
    expect(specs.single.viewId, 'right-workspace');
    expect(specs.single.sessionId, isNull);
    expect(specs.single.form, IslandForm.page);
    expect(specs.single.package, entry.package);
    expect(container.read(seatPlanProvider(entry.request('s1'))).visible.single.island!.viewId, isNull);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Ctrl+1/2/3 select existing terminals from the PTY, chat, and hidden dock', (tester) async {
    final backend = FakeTerminalBackend(terminals: [infoJson('a'), infoJson('b'), infoJson('c')]);
    final container = await _pump(tester, backend);
    await _toggleKey(tester);
    for (final (key, id) in [
      (LogicalKeyboardKey.digit1, 'a'),
      (LogicalKeyboardKey.digit2, 'b'),
      (LogicalKeyboardKey.digit3, 'c'),
    ]) {
      await tester.sendKeyDownEvent(LogicalKeyboardKey.controlLeft);
      await tester.sendKeyEvent(key);
      await tester.sendKeyUpEvent(LogicalKeyboardKey.controlLeft);
      await settleTerminal(tester);
      expect(container.read(terminalWorkspaceProvider('s1')).selectedId, id);
      expect(tester.widget<TerminalView>(find.byType(TerminalView)).focusNode!.hasFocus, isTrue);
    }
    expect(backend.attachOf('a').written, isEmpty);
    expect(backend.attachOf('b').written, isEmpty);
    expect(backend.attachOf('c').written, isEmpty);
    await _toggleKey(tester);
    await tester.tap(find.byKey(_chat));
    await tester.sendKeyDownEvent(LogicalKeyboardKey.controlLeft);
    await tester.sendKeyEvent(LogicalKeyboardKey.digit2);
    await tester.sendKeyUpEvent(LogicalKeyboardKey.controlLeft);
    await settleTerminal(tester);
    expect(find.byType(TerminalView), findsOneWidget);
    expect(container.read(terminalWorkspaceProvider('s1')).selectedId, 'b');
    final model = container.read(terminalWorkspaceProvider('s1')).selected!.terminal;
    expect(tester.widget<TerminalView>(find.byType(TerminalView)).theme.background, isNot(const Color(0xFF152B46)));
    await container.read(terminalColorProvider.notifier).set(TerminalColor.blue);
    await settleTerminal(tester);
    expect(tester.widget<TerminalView>(find.byType(TerminalView)).theme.background, const Color(0xFF152B46));
    expect(container.read(terminalWorkspaceProvider('s1')).selected!.terminal, same(model));
    expect(backend.created, isEmpty);
  });

  testWidgets('a first Ctrl+2 waits for the host listing before selecting its second terminal', (tester) async {
    final backend = _SlowListing();
    final container = await _pump(tester, backend);
    await tester.sendKeyDownEvent(LogicalKeyboardKey.controlLeft);
    await tester.sendKeyEvent(LogicalKeyboardKey.digit2);
    await tester.sendKeyUpEvent(LogicalKeyboardKey.controlLeft);
    await settleTerminal(tester);
    expect(container.read(terminalWorkspaceProvider('s1')).loading, isTrue);
    backend.listed.complete();
    await settleTerminal(tester);
    expect(container.read(terminalWorkspaceProvider('s1')).selectedId, 'b');
    expect(backend.created, isEmpty);
    expect(tester.takeException(), isNull);
  });

  for (final hold in [false, true]) {
    const kind = PointerDeviceKind.mouse;
    testWidgets('primary click ${hold ? 'held' : 'immediate'} drag reorders headers and moves between groups', (
      tester,
    ) async {
      final container = await _pump(
        tester,
        FakeTerminalBackend(),
        plugins: true,
        overrides: panels.panelOverrides(panels.usageBridge(), panels.inventory()),
      );
      final entry = container.read(workspacePanelEntriesProvider('s1')).firstWhere((e) => e.cell == 'dsh-go:usage');
      final main = find.byKey(ValueKey('workspace-main-${entry.key}'));
      await _moveTab(tester, main, 'below', kind: kind, hold: hold);
      final details = find.byKey(const ValueKey('workspace-details-tab'));
      final gesture = await tester.startGesture(
        tester.getCenter(find.byKey(ValueKey('workspace-dock-${entry.key}'))),
        kind: kind,
      );
      await gesture.moveBy(const Offset(20, 0));
      await tester.pump(const Duration(milliseconds: 50));
      final target = tester.getRect(details);
      await gesture.moveTo(Offset(target.left + 4, target.center.dy));
      await tester.pump(const Duration(milliseconds: 100));
      await gesture.up();
      await settleTerminal(tester);
      expect(find.byKey(const ValueKey('workspace-bottom-group')), findsNothing);
      expect(tester.getRect(main).left, lessThan(tester.getRect(details).left));
      expect(container.read(workspacePanelPrefsProvider('local:local')).order.first, entry.key);
      // Reorder horizontally in the same group, placing the plugin after details.
      final reorder = await tester.startGesture(tester.getCenter(main), kind: kind);
      await reorder.moveBy(const Offset(20, 0));
      await tester.pump(const Duration(milliseconds: 50));
      final anchor = tester.getRect(details);
      await reorder.moveTo(Offset(anchor.right - 4, anchor.center.dy));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 60));
      final midway = tester.getRect(details).left;
      expect(midway, lessThan(anchor.left));
      await tester.pump(const Duration(milliseconds: 200));
      expect(tester.getRect(details).left, lessThan(midway));
      await reorder.up();
      await settleTerminal(tester);
      expect(tester.getRect(main).left, greaterThan(tester.getRect(details).left));
      final savedOrder = container.read(workspacePanelPrefsProvider('local:local')).order;
      final cancelled = await tester.startGesture(tester.getCenter(main), kind: kind);
      await cancelled.moveBy(const Offset(20, 0));
      await tester.pump(const Duration(milliseconds: 50));
      final before = tester.getRect(details);
      await cancelled.moveTo(Offset(before.left + 4, before.center.dy));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 60));
      expect(tester.getRect(details).left, greaterThan(before.left));
      await cancelled.cancel();
      await settleTerminal(tester);
      expect(container.read(workspacePanelPrefsProvider('local:local')).order, savedOrder);
      expect(tester.getRect(main).left, greaterThan(tester.getRect(details).left));
      expect(tester.takeException(), isNull);
    });
  }

  test('group ownership serializes startup moves and restores per host', () async {
    final container = ProviderContainer();
    await container
        .read(workspacePanelPrefsProvider('local:local').notifier)
        .arrange(
          ['plugin', workspaceDetailsKey, 'plugin'],
          selected: 'plugin',
          order: ['other', 'plugin', workspaceDetailsKey],
        );
    expect(container.read(workspacePanelPrefsProvider('ssh:other')).pins, isEmpty);
    container.dispose();
    final restored = ProviderContainer();
    addTearDown(restored.dispose);
    final controller = restored.read(workspacePanelPrefsProvider('local:local').notifier);
    await controller.ready;
    expect(restored.read(workspacePanelPrefsProvider('local:local')).pins, ['plugin', workspaceDetailsKey]);
    expect(restored.read(workspacePanelPrefsProvider('local:local')).selected, 'plugin');
    expect(restored.read(workspacePanelPrefsProvider('local:local')).order, ['other', 'plugin', workspaceDetailsKey]);
    await controller.arrange([], selected: workspaceDetailsKey);
    expect(restored.read(workspacePanelPrefsProvider('local:local')).pins, isEmpty);
  });

  test('candidate entries honor existing hidden overrides and route guard', () {
    final container = ProviderContainer(
      overrides: [
        ...seats.seatOverrides(inventory: seats.seatInventory(occupancy: seats.fullOccupancy, routeGuard: false)),
        seatOverridesProvider.overrideWithValue(
          const SeatOverrides({
            Slots.rightPaneTab: {seats.probe: SeatOverride.hidden},
          }),
        ),
      ],
    );
    addTearDown(container.dispose);
    final entries = container.read(workspacePanelEntriesProvider('s1'));
    expect(entries.where((e) => e.slot == Slots.rightPaneTab), isEmpty);
    final request = entries.first.request('s1', viewId: 'right-tabs');
    expect(container.read(seatPlanProvider(request)).visible.single.mode, SeatMode.webLink);
    expect(request.sessionId, isNull);
  });

  test('web registrations with the same cell in different slots remain distinct entries', () {
    final container = ProviderContainer(
      overrides: seats.seatOverrides(
        inventory: seats.seatInventory(
          occupancy: {
            Slots.main: [seats.occupant(Slots.main, seats.probe, 'same')],
            Slots.rightPaneTab: [seats.occupant(Slots.rightPaneTab, seats.probe, 'same')],
          },
        ),
      ),
    );
    addTearDown(container.dispose);
    expect(container.read(workspacePanelEntriesProvider('s1')).map((e) => e.slot).toSet(), {
      Slots.main,
      Slots.rightPaneTab,
    });
  });
}
