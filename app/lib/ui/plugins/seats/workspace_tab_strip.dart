import 'package:flutter/material.dart';

/// Stable tab children slide to their new positions while a header is reordered.
class WorkspaceTabStrip extends StatelessWidget {
  const WorkspaceTabStrip({
    super.key,
    required this.keys,
    required this.titles,
    required this.itemBuilder,
    this.preview,
  });
  final List<String> keys;
  final Map<String, String> titles;
  final List<String>? preview;
  final Widget Function(String) itemBuilder;

  @override
  Widget build(BuildContext context) {
    final widths = <String, double>{};
    for (final key in keys) {
      final text = TextPainter(
        text: TextSpan(text: titles[key], style: Theme.of(context).textTheme.labelLarge),
        textDirection: Directionality.of(context),
        textScaler: MediaQuery.textScalerOf(context),
      )..layout();
      widths[key] = (text.width + 24).clamp(52, 180);
      text.dispose();
    }
    final order = [...?preview?.where(keys.contains), ...keys.where((key) => !(preview?.contains(key) ?? false))];
    final positions = <String, double>{};
    var left = 0.0;
    for (final key in order) {
      positions[key] = left;
      left += widths[key]!;
    }
    return LayoutBuilder(
      builder: (context, constraints) => SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: SizedBox(
          width: left,
          height: constraints.maxHeight,
          child: Stack(
            children: [
              for (final key in keys)
                AnimatedPositioned(
                  key: ValueKey('workspace-position-$key'),
                  duration: const Duration(milliseconds: 180),
                  curve: Curves.easeOutCubic,
                  left: positions[key],
                  top: 0,
                  bottom: 0,
                  width: widths[key],
                  child: itemBuilder(key),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
