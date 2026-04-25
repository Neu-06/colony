import '../models/instancia_tracking.dart';

abstract class RastreoRepository {
  Future<InstanciaTracking> rastrear(String codigo);
  Future<void> suscribirDispositivo(String codigo, String token);
}
