import 'dart:async';
import 'package:connectivity_plus/connectivity_plus.dart';

/// Exposes a real-time stream of network availability.
/// Use [isOnline] for a one-shot check or [onConnectivityChanged] for reactive updates.
class NetworkInfoService {
  final Connectivity _connectivity = Connectivity();

  /// Stream that emits `true` when online, `false` when offline.
  Stream<bool> get onConnectivityChanged => _connectivity
      .onConnectivityChanged
      .map((results) => _hasConnection(results));

  /// One-time check (async).
  Future<bool> get isOnline async {
    final result = await _connectivity.checkConnectivity();
    return _hasConnection(result);
  }

  bool _hasConnection(List<ConnectivityResult> results) {
    return results.any((r) =>
        r == ConnectivityResult.wifi ||
        r == ConnectivityResult.mobile ||
        r == ConnectivityResult.ethernet);
  }
}
