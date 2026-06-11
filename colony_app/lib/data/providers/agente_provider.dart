import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';

const String _baseUrl = 'http://192.168.1.112:8080';

class CampoRequerido {
  final String nombre;
  final String tipo;
  final bool requerido;
  final String? opciones;

  const CampoRequerido({
    required this.nombre,
    required this.tipo,
    required this.requerido,
    this.opciones,
  });

  factory CampoRequerido.fromJson(Map<String, dynamic> json) => CampoRequerido(
    nombre: json['nombre'] as String? ?? '',
    tipo: json['tipo'] as String? ?? 'text',
    requerido: json['requerido'] as bool? ?? false,
    opciones: json['opciones'] as String?,
  );

  bool get esArchivo => tipo == 'archivo';
}

class FlujoDisponible {
  final String flujoId;
  final String nombre;
  final String descripcion;
  final List<CampoRequerido> camposRequeridos;

  const FlujoDisponible({
    required this.flujoId,
    required this.nombre,
    required this.descripcion,
    required this.camposRequeridos,
  });

  factory FlujoDisponible.fromJson(Map<String, dynamic> json) =>
      FlujoDisponible(
        flujoId: json['flujoId'] as String? ?? '',
        nombre: json['nombre'] as String? ?? '',
        descripcion: json['descripcion'] as String? ?? '',
        camposRequeridos:
            (json['camposRequeridos'] as List<dynamic>?)
                ?.map((e) => CampoRequerido.fromJson(e as Map<String, dynamic>))
                .toList() ??
            [],
      );
}

class RespuestaAgente {
  final String? flujoDetectado;
  final String? flujoNombre;
  final Map<String, dynamic> datosExtraidos;
  final Map<String, dynamic> datosAcumulados;
  final List<String> datosFaltantes;
  final String? campoActual;
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
    this.campoActual,
    this.preguntaSugerida,
    this.instanciarAhora = false,
    this.instanciaId,
    this.codigoTramite,
    required this.mensajeAgente,
    this.confianza = 'baja',
  });

  factory RespuestaAgente.fromJson(Map<String, dynamic> json) =>
      RespuestaAgente(
        flujoDetectado: json['flujoDetectado'] as String?,
        flujoNombre: json['flujoNombre'] as String?,
        datosExtraidos: (json['datosExtraidos'] as Map<String, dynamic>?) ?? {},
        datosAcumulados:
            (json['datosAcumulados'] as Map<String, dynamic>?) ?? {},
        datosFaltantes:
            (json['datosFaltantes'] as List<dynamic>?)
                ?.map((e) => e.toString())
                .toList() ??
            [],
        campoActual: json['campoActual'] as String?,
        preguntaSugerida: json['preguntaSugerida'] as String?,
        instanciarAhora: json['instanciarAhora'] as bool? ?? false,
        instanciaId: json['instanciaId'] as String?,
        codigoTramite: json['codigoTramite'] as String?,
        mensajeAgente: json['mensajeAgente'] as String? ?? 'Sin respuesta',
        confianza: json['confianza'] as String? ?? 'baja',
      );
}

class AgenteProvider {
  const AgenteProvider();

  Future<List<FlujoDisponible>> obtenerFlujos() async {
    final response = await http.get(
      Uri.parse('$_baseUrl/api/agente/flujos'),
      headers: {'Accept': 'application/json'},
    );
    if (response.statusCode == 200) {
      final list = jsonDecode(response.body) as List<dynamic>;
      return list
          .map((e) => FlujoDisponible.fromJson(e as Map<String, dynamic>))
          .toList();
    }
    throw Exception('Error al cargar flujos (${response.statusCode})');
  }

  Future<RespuestaAgente> enviarMensaje({
    required String mensaje,
    required List<Map<String, String>> historialChat,
    required Map<String, dynamic> datosAcumulados,
    String? identificadorCliente,
  }) async {
    final body = <String, dynamic>{
      'mensaje': mensaje,
      'historialChat': historialChat,
      'datosAcumulados': datosAcumulados,
      if (identificadorCliente != null)
        'identificadorCliente': identificadorCliente,
    };

    final response = await http.post(
      Uri.parse('$_baseUrl/api/agente/chat'),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: jsonEncode(body),
    );

    if (response.statusCode == 200) {
      return RespuestaAgente.fromJson(
        jsonDecode(response.body) as Map<String, dynamic>,
      );
    }
    throw Exception('Error del agente (${response.statusCode})');
  }

  Future<void> subirDocumento(
    String instanciaId,
    String filePath,
    String fileName,
  ) async {
    final uri = Uri.parse('$_baseUrl/api/agente/subir-documento/$instanciaId');
    final request = http.MultipartRequest('POST', uri);

    String mimeType = 'application/octet-stream';
    final nameLower = fileName.toLowerCase();
    if (nameLower.endsWith('.jpg') || nameLower.endsWith('.jpeg'))
      mimeType = 'image/jpeg';
    else if (nameLower.endsWith('.png'))
      mimeType = 'image/png';
    else if (nameLower.endsWith('.pdf'))
      mimeType = 'application/pdf';

    final typeData = mimeType.split('/');

    request.files.add(
      await http.MultipartFile.fromPath(
        'archivo',
        filePath,
        filename: fileName,
        contentType: MediaType(typeData[0], typeData[1]),
      ),
    );

    final response = await request.send();
    if (response.statusCode != 200) {
      throw Exception('Error al subir documento (${response.statusCode})');
    }
  }
}
