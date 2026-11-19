import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

enum TerminalColor { blue, classic }

class TerminalColorController extends Notifier<TerminalColor> {
  static const key = 'terminal.color';
  late Future<void> _loaded;

  @override
  TerminalColor build() {
    _loaded = _load();
    return TerminalColor.classic;
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = TerminalColor.values.asNameMap()[prefs.getString(key)];
    if (ref.mounted && saved != null) state = saved;
  }

  Future<void> set(TerminalColor color) async {
    await _loaded;
    final saved = await (await SharedPreferences.getInstance()).setString(key, color.name);
    if (!saved) throw StateError('terminal_color_save_failed');
    if (ref.mounted) state = color;
  }
}

final terminalColorProvider = NotifierProvider<TerminalColorController, TerminalColor>(TerminalColorController.new);
