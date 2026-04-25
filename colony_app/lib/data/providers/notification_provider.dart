import 'package:firebase_messaging/firebase_messaging.dart';
import 'api_provider.dart';

class NotificationProvider {
  const NotificationProvider(this._apiProvider);

  final ApiProvider _apiProvider;

  Future<void> registerDevice(String codigo) async {
    FirebaseMessaging messaging = FirebaseMessaging.instance;

    // Solicitar permisos
    NotificationSettings settings = await messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );

    if (settings.authorizationStatus == AuthorizationStatus.authorized) {
      // Obtener el token
      String? token = await messaging.getToken();
      if (token != null) {
        // Enviar al backend
        await _apiProvider.subscribeToNotifications(codigo, token);
      } else {
        throw Exception('No se pudo obtener el token del dispositivo');
      }
    } else if (settings.authorizationStatus == AuthorizationStatus.denied) {
      throw Exception('El usuario denegó los permisos de notificación');
    }
  }
}
