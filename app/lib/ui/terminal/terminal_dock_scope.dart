import 'package:flutter/widgets.dart';
import 'package:flutter/services.dart';

const terminalNumberKeys = [
  LogicalKeyboardKey.digit1,
  LogicalKeyboardKey.digit2,
  LogicalKeyboardKey.digit3,
  LogicalKeyboardKey.digit4,
  LogicalKeyboardKey.digit5,
  LogicalKeyboardKey.digit6,
  LogicalKeyboardKey.digit7,
  LogicalKeyboardKey.digit8,
  LogicalKeyboardKey.digit9,
];

/// Lets existing terminal entry buttons control the conversation's terminal.
class TerminalDockScope extends InheritedWidget {
  const TerminalDockScope({super.key, required this.toggle, required super.child});
  final VoidCallback toggle;

  static TerminalDockScope? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<TerminalDockScope>();

  @override
  bool updateShouldNotify(TerminalDockScope oldWidget) => toggle != oldWidget.toggle;
}
