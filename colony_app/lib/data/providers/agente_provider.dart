import 'dart:convert';
import 'package:http/http.dart' as http;

class RespuestaAgente {
  final String? flujoDetectado;
  final String? flujoNombre;
  final Map<String, dynamic> datosExtraidos;
  final Map<String, dynamic> datosAcumulados;
  final List<String> datosFaltantes;
  final String? preguntaSugerida;
  final bool instanciarAhora;
  final String? instanciaId;
  final String? codigoTramite;
  final String mensajeAgente;
  final String confianza;

  const RespuestaAgente({
    this.flujoDetectado,
    this.flujoNombre,
    this.datosExtraidos = const {},
    this.datosAcumulados = const {},
    this.datosFaltantes = const [],
    this.preguntaSugerida,
    this.instanciarAhora = false,
    this.instanciaId,
    this.codigoTramite,
    required this.mensajeAgente,
    this.confianza = 'baja',
  });

  factory RespuestaAgente.fromJson(Map<String, dynamic> json) {
    return RespuestaAgente(
      flujoDetectado: json['flujoDetectado'] as String?,
      flujoNombre: json['flujoNombre'] as String?,
      datosExtraidos: (json['datosExtraidos'] as Map<String, dynamic>?) ?? {},
      datosAcumulados: (json['datosAcumulados'] as Map<String, dynamic>?) ?? {},
      datosFaltantes: (json['datosFaltantes'] as List<dynamic>?)
              ?.map((e) => e.toString())
              .toList() ??
          [],
      preguntaSugerida: json['preguntaSugerida'] as String?,
      instanciarAhora: json['instanciarAhora'] as bool? ?? false,
      instanciaId: json['instanciaId'] as String?,
      codigoTramite: json['codigoTramite'] as String?,
      mensajeAgente: json['mensajeAgente'] as String? ?? 'Sin respuesta',
      confianza: json['confianza'] as String? ?? 'baja',
    );
  }
}

class AgenteProvider {
  const AgenteProvider();

  static const String _baseUrl = 'http://10.0.2.2:8080';

  Future<RespuestaAgente> enviarMensaje({
    required String mensaje,
    required List<Map<String, String>> historialChat,
    required Map<String, dynamic> datosAcumulados,
    String? identificadorCliente,
  }) async {
    final uri = Uri.parse('$_baseUrl/api/agente/chat');

    final body = {
      'mensaje': mensaje,
      'historialChat': historialChat,
      'datosAcumulados': datosAcumulados,
      if (identificadorCliente != null)
        'identificadorCliente': identificadorCliente,
    };

    final response = await http.post(
      uri,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: jsonEncode(body),
    );

    if (response.statusCode == 200) {
      final json = jsonDecode(response.body) as Map<String, dynamic>;
      return RespuestaAgente.fromJson(json);
    }

    throw Exception('Error del agente (${response.statusCode})');
  }
}
