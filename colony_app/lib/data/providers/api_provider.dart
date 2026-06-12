import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../domain/models/instancia_tracking.dart';

class ApiProvider {
  const ApiProvider();

  // Cambia a https://javi-dev.me si usas el proxy inverso (Nginx) en el servidor de produccion
  static const String _baseUrl = 'https://javi-dev.me';

  Future<InstanciaTracking> fetchTrackingByCode(String codigo) async {
    final uri = Uri.parse('$_baseUrl/api/rastreo/$codigo');
    final response = await http.get(
      uri,
      headers: {'Accept': 'application/json'},
    );

    if (response.statusCode == 200) {
      final body = jsonDecode(response.body) as Map<String, dynamic>;
      return InstanciaTracking.fromJson(body);
    }

    if (response.statusCode == 404) {
      throw Exception('Tramite no encontrado');
    }

    throw Exception('Error de red al consultar el tramite');
  }

  Future<void> subscribeToNotifications(
    String codigo,
    String deviceToken,
  ) async {
    final uri = Uri.parse('$_baseUrl/api/rastreo/$codigo/suscribir');
    final response = await http.post(
      uri,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: jsonEncode({'token': deviceToken}),
    );

    if (response.statusCode != 200) {
      throw Exception('Error al suscribirse a notificaciones');
    }
  }
}
