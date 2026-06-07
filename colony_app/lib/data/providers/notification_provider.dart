import 'package:firebase_messaging/firebase_messaging.dart';
import 'api_provider.dart';

class NotificationProvider {
  const NotificationProvider(this._apiProvider);

  final ApiProvider _apiProvider;

  Future<void> registerDevice(String codigo) async {
    print("🔥 SOLICITANDO PERMISOS DE NOTIFICACIÓN...");
    FirebaseMessaging messaging = FirebaseMessaging.instance;

    // Solicitar permisos
    NotificationSettings settings = await messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );

    if (settings.authorizationStatus == AuthorizationStatus.authorized) {
      print("🔥 PERMISOS CONCEDIDOS. OBTENIENDO TOKEN FCM...");
      try {
        // Obtener el token
        String? token = await messaging.getToken();
        if (token != null) {
          print("🔥 TOKEN FCM DEL CELULAR: $token");
          print("🔥 ENVIANDO TOKEN AL BACKEND (Trámite: $codigo)...");
          
          // Enviar al backend
          // NOTA: Asegúrate de que el endpoint llamado aquí en apiProvider
          // coincida con tu backend real para guardar tokens.
          await _apiProvider.subscribeToNotifications(codigo, token);
          
          print("🔥 TOKEN ENVIADO CORRECTAMENTE AL BACKEND.");
        } else {
          print("🔥 ERROR: EL TOKEN OBTENIDO ES NULL.");
          throw Exception('No se pudo obtener el token del dispositivo');
        }
      } catch (e) {
        print("🔥 ERROR AL OBTENER O ENVIAR EL TOKEN FCM: $e");
        rethrow;
      }
    } else if (settings.authorizationStatus == AuthorizationStatus.denied) {
      print("🔥 ERROR: EL USUARIO DENEGÓ LOS PERMISOS.");
      throw Exception('El usuario denegó los permisos de notificación');
    } else {
      print("🔥 ESTADO DE AUTORIZACIÓN: ${settings.authorizationStatus}");
    }
  }
}
