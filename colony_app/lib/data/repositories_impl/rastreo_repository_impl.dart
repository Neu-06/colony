import '../../domain/models/instancia_tracking.dart';
import '../../domain/repositories/rastreo_repository.dart';
import '../providers/api_provider.dart';

class RastreoRepositoryImpl implements RastreoRepository {
  const RastreoRepositoryImpl(this._apiProvider);

  final ApiProvider _apiProvider;

  @override
  Future<InstanciaTracking> rastrear(String codigo) {
    return _apiProvider.fetchTrackingByCode(codigo);
  }

  @override
  Future<void> suscribirDispositivo(String codigo, String token) {
    return _apiProvider.subscribeToNotifications(codigo, token);
  }
}
