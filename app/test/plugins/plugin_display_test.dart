import 'package:dsh_app/plugins/seams/seams.dart';
import 'package:dsh_app/state/hosts_state.dart';
import 'package:dsh_app/state/workspace_panels_state.dart';
import 'package:dsh_app/ui/plugins/plugin_detail_sheet.dart';
import 'package:dsh_app/ui/plugins/seats/session_plugins_tab.dart';
import 'package:dsh_client/dsh_client.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../chat/support/harness.dart';
import 'native/native_panel_test.dart' as panels;
import 'support/fake_plugin_host.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test(
    'wide details exclude independent packages while original plugin lists retain their scope and entries',
    () async {
      final container = ProviderContainer(overrides: [seatInventoryProvider.overrideWith((ref) => panels.inventory())]);
      addTearDown(container.dispose);
      final original = container
          .read(sessionPluginPlanProvider('s1'))
          .visible
          .map((item) => item.occupant.package)
          .toList();
      expect(original, contains('dsh-go-example-usage'));
      await container
          .read(pluginDisplayProvider(HostRef.local).notifier)
          .setIndependent('dsh-go-example-usage', '用量', true);
      expect(container.read(sessionPluginPlanProvider('s1')).visible.map((item) => item.occupant.package), original);
      expect(container.read(embeddedSessionPluginPlanProvider('s1')).visible.map((item) => item.occupant.package), [
        'web-only',
      ]);
      await container
          .read(pluginDisplayProvider(HostRef.local).notifier)
          .setIndependent('dsh-go-example-usage', '用量', false);
      expect(
        container.read(embeddedSessionPluginPlanProvider('s1')).visible.map((item) => item.occupant.package),
        original,
      );
    },
  );

  test('display preferences default embedded, serialize early changes and restore per host and package', () async {
    final container = ProviderContainer();
    final controller = container.read(pluginDisplayProvider(HostRef.local).notifier);
    expect(container.read(pluginDisplayProvider(HostRef.local)), isEmpty);
    await Future.wait([
      controller.setIndependent('pkg-a', 'Same title', true),
      controller.setIndependent('pkg-b', 'Same title', true),
      controller.setIndependent('pkg-a', 'Renamed A', false),
    ]);
    expect(container.read(pluginDisplayProvider(const HostRef.ssh('other'))), isEmpty);
    container.dispose();
    final restored = ProviderContainer();
    addTearDown(restored.dispose);
    await restored.read(pluginDisplayProvider(HostRef.local).notifier).ready;
    final prefs = restored.read(pluginDisplayProvider(HostRef.local));
    expect(prefs['pkg-a']!.independent, isFalse);
    expect(prefs['pkg-a']!.name, 'Renamed A');
    expect(prefs['pkg-b']!.independent, isTrue);
    expect(restored.read(pluginDisplayProvider(const HostRef.ssh('other'))), isEmpty);
  });

  testWidgets('installed plugin details changes only the local display switch', (tester) async {
    usePhoneView(tester);
    final carrier = FakePluginCarrier();
    final client = DshClient.withCarrier(carrier);
    addTearDown(client.close);
    final json = bundleJson('dsh-go-example-usage', title: {'zh': '用量', 'en': 'Usage'});
    carrier.handlers['pluginManager/listBundles'] = (_) => [json];
    await tester.pumpWidget(
      testApp(
        Scaffold(
          body: BundleSheet(name: 'dsh-go-example-usage', initial: PluginBundle.fromJson(json)),
        ),
        overrides: [
          ...pluginOverrides(fakeHost(client)),
          seatInventoryProvider.overrideWith((ref) => panels.inventory()),
        ],
      ),
    );
    await tester.pumpAndSettle();
    final toggle = find.byKey(const ValueKey('plugin-independent-switch'));
    await tester.ensureVisible(toggle);
    expect(tester.widget<Switch>(toggle).value, isFalse);
    await tester.tap(toggle);
    await tester.pumpAndSettle();
    expect(tester.widget<Switch>(toggle).value, isTrue);
    final container = ProviderScope.containerOf(tester.element(toggle));
    expect(container.read(pluginDisplayProvider(HostRef.local))['dsh-go-example-usage']!.independent, isTrue);
    expect(carrier.argsOf('pluginManager/setBundleEnabled'), isEmpty);
    await tester.tap(toggle);
    await tester.pumpAndSettle();
    expect(tester.widget<Switch>(toggle).value, isFalse);
    expect(tester.takeException(), isNull);
  });
}
