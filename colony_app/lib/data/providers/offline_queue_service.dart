import 'package:hive_flutter/hive_flutter.dart';

const _boxName = 'offline_rastreo_queue';

class PendingRastreo {
  final String codigo;
  final String fcmToken;
  final int timestamp;

  PendingRastreo({
    required this.codigo,
    required this.fcmToken,
    required this.timestamp,
  });

  Map<String, dynamic> toMap() => {
        'codigo': codigo,
        'fcmToken': fcmToken,
        'timestamp': timestamp,
      };

  factory PendingRastreo.fromMap(Map<dynamic, dynamic> map) => PendingRastreo(
        codigo: map['codigo'] as String,
        fcmToken: map['fcmToken'] as String,
        timestamp: map['timestamp'] as int,
      );
}

/// Manages a persistent offline queue of pending rastreo requests using Hive.
class OfflineQueueService {
  late Box _box;

  Future<void> init() async {
    _box = await Hive.openBox(_boxName);
  }

  Future<void> enqueue(PendingRastreo item) async {
    await _box.put('${item.codigo}_${item.timestamp}', item.toMap());
  }

  List<PendingRastreo> getAll() {
    return _box.values
        .map((v) => PendingRastreo.fromMap(v as Map))
        .toList();
  }

  Future<void> remove(String codigo) async {
    final keys = _box.keys.where((k) => (k as String).startsWith('${codigo}_')).toList();
    for (final key in keys) {
      await _box.delete(key);
    }
  }

  bool get isEmpty => _box.isEmpty;
}
