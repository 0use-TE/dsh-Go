import 'package:dsh_app/state/terminal_color_state.dart';
import 'package:dsh_app/ui/settings/interface_page.dart';
import 'package:dsh_app/ui/settings/settings_widgets.dart';
import 'package:dsh_client/dsh_client.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../engine_settings/support.dart' as engine;

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('interface offers blue and classic colors, remembers selection and restores it', (tester) async {
    Future<void> pump() => engine.pumpPage(
      tester,
      const InterfacePage(),
      height: 2400,
      overrides: engine.engineOverrides(DshClient.withCarrier(engine.FakeSettingsHost())),
    );
    await pump();
    final row = find.byKey(const ValueKey('terminal-color-setting'));
    final container = ProviderScope.containerOf(tester.element(row));
    expect(container.read(terminalColorProvider), TerminalColor.classic);
    await tester.ensureVisible(row);
    await tester.pumpAndSettle();
    await tester.tap(find.descendant(of: row, matching: find.text('深蓝色')));
    await tester.pumpAndSettle();
    expect(container.read(terminalColorProvider), TerminalColor.blue);
    expect((await SharedPreferences.getInstance()).getString(TerminalColorController.key), 'blue');
    await tester.pumpWidget(const SizedBox());
    await pump();
    expect(tester.widget<SettingsSegmentTile<TerminalColor>>(row).selected, TerminalColor.blue);
    expect(SettingsIndex.spots, contains(Spots.terminalColor));
  });
}
