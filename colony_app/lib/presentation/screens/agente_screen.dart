import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:speech_to_text/speech_to_text.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter_tts/flutter_tts.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../data/providers/agente_provider.dart';
import '../../data/providers/notification_provider.dart';
import '../../data/providers/api_provider.dart';

class AgenteScreen extends StatefulWidget {
  const AgenteScreen({super.key});

  @override
  State<AgenteScreen> createState() => _AgenteScreenState();
}

class _AgenteScreenState extends State<AgenteScreen>
    with TickerProviderStateMixin {
  final TextEditingController _inputController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  final AgenteProvider _agente = const AgenteProvider();
  final SpeechToText _speechToText = SpeechToText();
  final FlutterTts _flutterTts = FlutterTts();

  bool _isListening = false;
  bool _vozActivada = true;
  bool _cargando = false;
  bool _cargandoFlujos = false;
  String? _codigoTramiteCreado;
  String? _flujoActivoId;
  List<CampoRequerido> _camposRequeridos = [];
  int _camposCompletados = 0;
  String? _campoActual;

  final List<_ChatMessage> _mensajes = [];
  List<Map<String, String>> _historialChat = [];
  Map<String, dynamic> _datosAcumulados = {};
  List<FlujoDisponible> _flujosDisponibles = [];
  
  // Mapa de CampoNombre -> Path del archivo local
  final Map<String, String> _archivosPendientes = {};

  @override
  void initState() {
    super.initState();
    _speechToText.initialize();
    _initTts();
    _mensajes.add(_ChatMessage(
      texto: '¡Hola! 👋 Soy el asistente de Colony. Puedo ayudarte a iniciar un trámite.\n\n'
          'Describe lo que necesitas o consulta los servicios disponibles abajo.',
      esAgente: true,
    ));
    _cargarFlujos();
  }

  Future<void> _initTts() async {
    await _flutterTts.setLanguage("es-US");
    await _flutterTts.setSpeechRate(0.5);
    await _flutterTts.setVolume(1.0);
    await _flutterTts.setPitch(1.0);
  }

  @override
  void dispose() {
    _inputController.dispose();
    _scrollController.dispose();
    _speechToText.stop();
    super.dispose();
  }

  Future<void> _cargarFlujos() async {
    setState(() => _cargandoFlujos = true);
    try {
      _flujosDisponibles = await _agente.obtenerFlujos();
    } catch (_) {
      _flujosDisponibles = [];
    } finally {
      if (mounted) setState(() => _cargandoFlujos = false);
    }
  }

  Future<void> _adjuntarArchivo() async {
    if (_campoActual == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Aún no es momento de subir un archivo.')),
      );
      return;
    }
    FilePickerResult? result = await FilePicker.pickFiles();
    if (result != null && result.files.single.path != null) {
      final file = result.files.single;

      _archivosPendientes[_campoActual!] = file.path!;
      
      // Simular que el cliente envía el nombre del archivo
      _enviarMensaje("He adjuntado el archivo: ${file.name}");
    }
  }

  Future<void> _enviarMensaje([String? textoForzado]) async {
    final texto = textoForzado ?? _inputController.text.trim();
    if (texto.isEmpty || _cargando) return;

    if (_isListening) {
      _speechToText.stop();
      _isListening = false;
    }

    _inputController.clear();

    setState(() {
      _mensajes.add(_ChatMessage(texto: texto, esAgente: false));
      _cargando = true;
    });
    _inputController.clear();
    _scrollAlFinal();

    try {
      final acumuladosAEnviar = Map<String, dynamic>.from(_datosAcumulados);

      final respuesta = await _agente.enviarMensaje(
        mensaje: texto,
        historialChat: _historialChat,
        datosAcumulados: acumuladosAEnviar,
      );

      _historialChat = [
        ..._historialChat,
        {'rol': 'cliente', 'texto': texto},
        {'rol': 'agente', 'texto': respuesta.mensajeAgente},
      ];
      // Fusionar: los datos acumulados del servidor ya traen todo (incluyendo __flujoId__)
      _datosAcumulados = {..._datosAcumulados, ...respuesta.datosAcumulados};
      _campoActual = respuesta.campoActual;

      if (respuesta.flujoDetectado != null &&
          respuesta.flujoDetectado != _flujoActivoId) {
        _flujoActivoId = respuesta.flujoDetectado;
        _camposRequeridos = _flujosDisponibles
            .where((f) => f.flujoId == respuesta.flujoDetectado)
            .expand((f) => f.camposRequeridos)
            .toList();
      }

      // Excluir clave interna __flujoId__ del conteo
      final totalCampos = _camposRequeridos.where((c) => c.requerido).length;
      final completados = _datosAcumulados.entries
          .where((e) => e.key != '__flujoId__' && e.value != null && e.value.toString().isNotEmpty)
          .length;
      _camposCompletados = completados.clamp(0, totalCampos);


      if (mounted) {
        if (respuesta.instanciarAhora && respuesta.instanciaId != null) {
          // Mantener cargando, mostrar solo que se está subiendo y crear instancia.
          setState(() {
            _cargando = true; // Sigue cargando mientras sube archivos
            _mensajes.add(_ChatMessage(
              texto: respuesta.mensajeAgente + '\n\n⏳ Subiendo documentos y finalizando trámite...',
              esAgente: true,
              flujoNombre: respuesta.flujoNombre,
              datosFaltantes: respuesta.datosFaltantes,
            ));
          });
          _scrollAlFinal();

          await _subirArchivosPendientes(respuesta.instanciaId!, respuesta.codigoTramite);
        } else {
          // Flujo normal, no se instancia aún o no hay instancia
          setState(() {
            _cargando = false;
            _mensajes.add(_ChatMessage(
              texto: respuesta.mensajeAgente,
              esAgente: true,
              flujoNombre: respuesta.flujoNombre,
              datosFaltantes: respuesta.datosFaltantes,
            ));
          });
          _scrollAlFinal();
          if (_vozActivada) _flutterTts.speak(respuesta.mensajeAgente);
        }
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _mensajes.add(_ChatMessage(
            texto: 'Lo siento, hubo un problema de conexión. ¿Podrías intentar de nuevo?',
            esAgente: true,
            esError: true,
          ));
          _cargando = false;
        });
        _scrollAlFinal();
      }
    }
  }

  Future<void> _subirArchivosPendientes(String instanciaId, String? codigo) async {
    try {
      if (_archivosPendientes.isNotEmpty) {
        for (var entry in _archivosPendientes.entries) {
          // Obtenemos el nombre del archivo de la ruta
          final fileName = entry.value.split('/').last;
          await _agente.subirDocumento(instanciaId, entry.value, fileName);
        }
      }
      
      setState(() {
        _codigoTramiteCreado = codigo;
        _cargando = false;
        _mensajes.add(_ChatMessage(
            texto: '✅ ¡Trámite finalizado!\nTu código de rastreo es: $codigo.' +
                   (_archivosPendientes.isNotEmpty ? '\n\nLos documentos se han adjuntado correctamente.' : ''),
            esAgente: true,
          ));
      });
      _scrollAlFinal();
      if (_vozActivada) _flutterTts.speak('Trámite finalizado. Tu código de rastreo es $codigo.');
      
      // Auto-suscribir a notificaciones y guardarlo en SharedPreferences
      if (codigo != null) {
        try {
          const notificationProvider = NotificationProvider(ApiProvider());
          await notificationProvider.registerDevice(codigo);
          
          final prefs = await SharedPreferences.getInstance();
          final suscripciones = prefs.getStringList('suscripciones') ?? [];
          if (!suscripciones.contains(codigo)) {
            suscripciones.add(codigo);
            await prefs.setStringList('suscripciones', suscripciones);
          }
        } catch (e) {
          debugPrint('No se pudo auto-suscribir a notificaciones: $e');
        }
      }
      
    } catch (e) {
      setState(() {
        _codigoTramiteCreado = codigo; // El tramite igual se creó
        _cargando = false;
        _mensajes.add(_ChatMessage(
            texto: '⚠️ El trámite se creó (Código: $codigo), pero hubo un problema adjuntando los documentos.',
            esAgente: true,
            esError: true,
          ));
      });
      _scrollAlFinal();
    }
  }

  void _seleccionarFlujo(FlujoDisponible flujo) {
    _enviarMensaje('Quiero iniciar el trámite: ${flujo.nombre}');
  }

  void _scrollAlFinal() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  void _reiniciarConversacion() {
    setState(() {
      _mensajes.clear();
      _historialChat = [];
      _datosAcumulados = {};
      _archivosPendientes.clear();
      _codigoTramiteCreado = null;
      _flujoActivoId = null;
      _campoActual = null;
      _camposRequeridos = [];
      _camposCompletados = 0;
      _mensajes.add(_ChatMessage(
        texto: 'Conversación reiniciada. ¿En qué trámite puedo ayudarte?',
        esAgente: true,
      ));
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF1F5F9),
      appBar: _buildAppBar(),
      body: Column(
        children: [
          if (_codigoTramiteCreado != null) _buildSuccessBanner(),
          if (_flujoActivoId != null &&
              _camposRequeridos.isNotEmpty &&
              _codigoTramiteCreado == null)
            _buildProgressBar(),
          Expanded(child: _buildMensajes()),
          if (_flujosDisponibles.isNotEmpty &&
              _flujoActivoId == null &&
              !_cargandoFlujos)
            _buildFlujosChips(),
          _buildInputArea(),
        ],
      ),
    );
  }

  AppBar _buildAppBar() {
    return AppBar(
      backgroundColor: const Color(0xFF1D4ED8),
      elevation: 0,
      leading: IconButton(
        icon: const Icon(Icons.arrow_back_ios, color: Colors.white, size: 20),
        onPressed: () {
          _flutterTts.stop();
          Navigator.pop(context);
        },
      ),
      title: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(2),
            decoration: const BoxDecoration(
              color: Colors.white,
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.smart_toy, color: Color(0xFF1D4ED8), size: 20),
          ),
          const SizedBox(width: 10),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Asistente Colony',
                  style: GoogleFonts.inter(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      color: Colors.white)),
              Text('En línea',
                  style: GoogleFonts.inter(
                      fontSize: 12,
                      fontWeight: FontWeight.w400,
                      color: Colors.white70)),
            ],
          ),
        ],
      ),
      actions: [
        IconButton(
          icon: Icon(
            _vozActivada ? Icons.volume_up : Icons.volume_off,
            color: Colors.white,
            size: 24,
          ),
          onPressed: () {
            setState(() {
              _vozActivada = !_vozActivada;
            });
            if (!_vozActivada) {
              _flutterTts.stop();
            }
          },
        ),
        IconButton(
          icon: const Icon(Icons.refresh, color: Colors.white, size: 20),
          onPressed: _reiniciarConversacion,
        ),
      ],
    );
  }

  Widget _buildProgressBar() {
    final total = _camposRequeridos.length;
    final progress = total > 0 ? _camposCompletados / total : 0.0;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      color: const Color(0xFFEFF6FF),
      child: Row(
        children: [
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: progress.clamp(0.0, 1.0),
                backgroundColor: const Color(0xFFBFDBFE),
                color: const Color(0xFF1D4ED8),
                minHeight: 6,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Text(
            '$_camposCompletados / $total datos',
            style: GoogleFonts.inter(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: const Color(0xFF1E40AF)),
          ),
        ],
      ),
    );
  }

  Widget _buildFlujosChips() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      color: Colors.white,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('Servicios disponibles:',
              style: GoogleFonts.inter(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: const Color(0xFF64748B))),
          const SizedBox(height: 6),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: _flujosDisponibles.map((f) {
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ActionChip(
                    label: Text(f.nombre,
                        style: GoogleFonts.inter(
                            fontSize: 12, fontWeight: FontWeight.w500)),
                    backgroundColor: const Color(0xFFDBEAFE),
                    labelStyle:
                        const TextStyle(color: Color(0xFF1E40AF)),
                    onPressed: () => _seleccionarFlujo(f),
                  ),
                );
              }).toList(),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSuccessBanner() {
    return GestureDetector(
      onTap: () {
        Clipboard.setData(ClipboardData(text: _codigoTramiteCreado!));
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Código copiado al portapapeles'),
            backgroundColor: Color(0xFF16A34A),
          ),
        );
      },
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [Color(0xFF16A34A), Color(0xFF15803D)],
          ),
        ),
        child: Row(
          children: [
            const Icon(Icons.check_circle, color: Colors.white, size: 20),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('¡Trámite iniciado correctamente!',
                      style: GoogleFonts.inter(
                          color: Colors.white,
                          fontWeight: FontWeight.w700,
                          fontSize: 13)),
                  Text(
                      'Código: $_codigoTramiteCreado   Toca para copiar',
                      style: GoogleFonts.inter(
                          color: Colors.white70, fontSize: 11)),
                ],
              ),
            ),
            const Icon(Icons.copy, color: Colors.white70, size: 16),
          ],
        ),
      ),
    );
  }

  Widget _buildMensajes() {
    return ListView.builder(
      controller: _scrollController,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      itemCount: _mensajes.length + (_cargando ? 1 : 0),
      itemBuilder: (context, index) {
        if (index == _mensajes.length) return _buildTypingIndicator();
        return _buildBurbuja(_mensajes[index]);
      },
    );
  }

  Widget _buildBurbuja(_ChatMessage msg) {
    final isAgent = msg.esAgente;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        mainAxisAlignment:
            isAgent ? MainAxisAlignment.start : MainAxisAlignment.end,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          if (isAgent)
            Container(
              width: 32,
              height: 32,
              margin: const EdgeInsets.only(right: 8, bottom: 2),
              decoration: BoxDecoration(
                color: msg.esError
                    ? const Color(0xFFEF4444)
                    : const Color(0xFF1D4ED8),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Icon(
                msg.esError ? Icons.error_outline : Icons.smart_toy_outlined,
                color: Colors.white,
                size: 16,
              ),
            ),
          Flexible(
            child: Column(
              crossAxisAlignment: isAgent
                  ? CrossAxisAlignment.start
                  : CrossAxisAlignment.end,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: isAgent
                        ? (msg.esError
                            ? const Color(0xFFFEE2E2)
                            : Colors.white)
                        : const Color(0xFF1D4ED8),
                    borderRadius: BorderRadius.only(
                      topLeft: const Radius.circular(18),
                      topRight: const Radius.circular(18),
                      bottomLeft: Radius.circular(isAgent ? 4 : 18),
                      bottomRight: Radius.circular(isAgent ? 18 : 4),
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withOpacity(0.05),
                        blurRadius: 6,
                        offset: const Offset(0, 2),
                      ),
                    ],
                  ),
                  child: Text(
                    msg.texto,
                    style: GoogleFonts.inter(
                      color: isAgent
                          ? (msg.esError
                              ? const Color(0xFF7F1D1D)
                              : const Color(0xFF0F172A))
                          : Colors.white,
                      fontSize: 14,
                      height: 1.5,
                    ),
                  ),
                ),
                if (msg.flujoNombre != null && msg.flujoNombre!.isNotEmpty)
                  Container(
                    margin: const EdgeInsets.only(top: 4),
                    padding: const EdgeInsets.symmetric(
                        horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: const Color(0xFFDBEAFE),
                      borderRadius: BorderRadius.circular(100),
                    ),
                    child: Text(
                      msg.flujoNombre!,
                      style: GoogleFonts.inter(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: const Color(0xFF1E40AF)),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTypingIndicator() {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Container(
            width: 32,
            height: 32,
            margin: const EdgeInsets.only(right: 8),
            decoration: BoxDecoration(
              color: const Color(0xFF1D4ED8),
              borderRadius: BorderRadius.circular(16),
            ),
            child: const Icon(Icons.smart_toy_outlined,
                color: Colors.white, size: 16),
          ),
          Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(18),
                topRight: Radius.circular(18),
                bottomRight: Radius.circular(18),
                bottomLeft: Radius.circular(4),
              ),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.05),
                  blurRadius: 6,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [_dot(0), _dot(1), _dot(2)],
            ),
          ),
        ],
      ),
    );
  }

  Widget _dot(int index) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0.0, end: 1.0),
      duration: Duration(milliseconds: 600 + index * 200),
      builder: (context, value, _) => Container(
        width: 8,
        height: 8,
        margin: const EdgeInsets.symmetric(horizontal: 2),
        decoration: BoxDecoration(
          color: Color.lerp(
              const Color(0xFF94A3B8), const Color(0xFF1D4ED8), value),
          borderRadius: BorderRadius.circular(4),
        ),
      ),
    );
  }

  void _toggleListening() async {
    if (_isListening) {
      setState(() => _isListening = false);
      _speechToText.stop();
      final texto = _inputController.text.trim();
      if (texto.isNotEmpty && !_cargando) _enviarMensaje(texto);
      return;
    }

    final status = await Permission.microphone.request();
    if (status != PermissionStatus.granted) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Permiso de micrófono denegado.')),
        );
      }
      return;
    }

    if (!_speechToText.isAvailable) {
      await _speechToText.initialize(
        onError: (_) {
          if (mounted) setState(() => _isListening = false);
        },
      );
    }

    if (_speechToText.isAvailable) {
      setState(() => _isListening = true);
      _inputController.clear();
      _speechToText.listen(
        onResult: (result) {
          if (mounted) {
             setState(() => _inputController.text = result.recognizedWords);
             
             // Enviar automáticamente cuando el resultado es final
             if (result.finalResult) {
                setState(() => _isListening = false);
                final texto = _inputController.text.trim();
                if (texto.isNotEmpty && !_cargando) {
                  _enviarMensaje(texto);
                }
             }
          }
        },
        listenOptions: SpeechListenOptions(
          localeId: 'es_US',
          listenMode: ListenMode.dictation,
          pauseFor: const Duration(seconds: 2), // Silencio corto y manda
        ),
      );
    }
  }

  Widget _buildInputArea() {
    final bloqueado = _cargando ||
        (_codigoTramiteCreado != null && _flujoActivoId != null);
    
    // Determinar si el campo actual requiere archivo para resaltar el boton
    final requiereArchivo = _camposRequeridos.any((c) => c.nombre == _campoActual && c.esArchivo);

    return Container(
      padding: const EdgeInsets.only(left: 12, right: 12, top: 12, bottom: 16),
      decoration: const BoxDecoration(
        color: Colors.white,
        boxShadow: [
          BoxShadow(
            color: Color(0x1A000000),
            blurRadius: 10,
            offset: Offset(0, -3),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: Row(
          children: [
            // Botón de Adjuntar Archivo
            AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              width: 44,
              height: 44,
              margin: const EdgeInsets.only(right: 4),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: requiereArchivo 
                    ? const Color(0xFF1D4ED8).withOpacity(0.1) 
                    : Colors.transparent,
              ),
              child: IconButton(
                onPressed: bloqueado ? null : _adjuntarArchivo,
                icon: Icon(
                  Icons.attach_file,
                  color: requiereArchivo 
                      ? const Color(0xFF1D4ED8)
                      : const Color(0xFF94A3B8),
                ),
              ),
            ),
            
            // Botón de Micrófono
            AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              width: 44,
              height: 44,
              margin: const EdgeInsets.only(right: 8),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: _isListening
                    ? const Color(0xFFEF4444).withOpacity(0.1)
                    : Colors.transparent,
              ),
              child: IconButton(
                onPressed: bloqueado ? null : _toggleListening,
                icon: Icon(
                  _isListening ? Icons.mic : Icons.mic_none,
                  color: _isListening
                      ? const Color(0xFFEF4444)
                      : const Color(0xFF94A3B8),
                ),
              ),
            ),
            Expanded(
              child: TextField(
                controller: _inputController,
                enabled: !bloqueado,
                maxLines: 3,
                minLines: 1,
                textInputAction: TextInputAction.send,
                onSubmitted: (_) => _enviarMensaje(),
                style: GoogleFonts.inter(fontSize: 14),
                decoration: InputDecoration(
                  hintText: _isListening
                      ? 'Escuchando...'
                      : (bloqueado
                          ? 'Trámite finalizado'
                          : 'Escribe tu respuesta...'),
                  hintStyle: GoogleFonts.inter(
                    color: _isListening
                        ? const Color(0xFFEF4444)
                        : const Color(0xFF94A3B8),
                  ),
                  filled: true,
                  fillColor: const Color(0xFFF8FAFC),
                  contentPadding: const EdgeInsets.symmetric(
                      horizontal: 16, vertical: 10),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(24),
                    borderSide:
                        const BorderSide(color: Color(0xFFE2E8F0)),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(24),
                    borderSide:
                        const BorderSide(color: Color(0xFFE2E8F0)),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(24),
                    borderSide: const BorderSide(
                        color: Color(0xFF1D4ED8), width: 1.5),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
            SizedBox(
              width: 44,
              height: 44,
              child: ElevatedButton(
                onPressed: bloqueado ? null : () => _enviarMensaje(),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF1D4ED8),
                  disabledBackgroundColor: const Color(0xFFCBD5E1),
                  shape: const CircleBorder(),
                  padding: EdgeInsets.zero,
                  elevation: 2,
                ),
                child: _cargando
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white),
                      )
                    : const Icon(Icons.send_rounded,
                        color: Colors.white, size: 20),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ChatMessage {
  final String texto;
  final bool esAgente;
  final bool esError;
  final String? flujoNombre;
  final List<String> datosFaltantes;

  _ChatMessage({
    required this.texto,
    required this.esAgente,
    this.esError = false,
    this.flujoNombre,
    this.datosFaltantes = const [],
  });
}
