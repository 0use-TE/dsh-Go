import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../plugins/seams/seams.dart';
import 'plugin_seat_page.dart';

/// The original plugin page content, with its native/web planner and scope.
class WorkspacePanelBody extends ConsumerWidget {
  const WorkspacePanelBody({super.key, required this.request});
  final SeatRequest request;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final items = ref.watch(seatPlanProvider(request)).visible;
    final native = items.every((item) => item.mode == SeatMode.native);
    final seat = PluginSeat(
      slot: request.slot,
      placement: request.placement,
      sessionId: request.sessionId,
      package: request.package,
      cell: request.cell,
      viewId: request.viewId,
      layout: native ? null : fillSeatLayout,
    );
    return native ? ListView(children: [seat]) : seat;
  }
}
