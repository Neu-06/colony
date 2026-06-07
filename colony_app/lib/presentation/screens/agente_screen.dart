import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:speech_to_text/speech_to_text.dart';
import 'package:permission_handler/permission_handler.dart';
import '../../data/providers/agente_provider.dart';

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
  bool _isListening = false;

  final List<_ChatMessage> _mensajes = [];
  List<Map<String, String>> _historialChat = [];
  Map<String, dynamic> _datosAcumulados = {};
  bool _cargando = false;
  String? _codigoTramiteCreado;

  @override
  void initState() {
    super.initState();
    _speechToText.initialize();
    _mensajes.add(
      _ChatMessage(
        texto:
            '¡Hola! 👋 Soy el asistente de Colony. Puedo ayudarte a iniciar un trámite.\n\n'
            '¿Qué trámite deseas realizar hoy? Puedes describírmelo en tus propias palabras.',
        esAgente: true,
      ),
    );
  }

  @override
  void dispose() {
    _inputController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _enviarMensaje() async {
    final texto = _inputController.text.trim();
    if (texto.isEmpty || _cargando) return;

    _inputController.clear();

    setState(() {
      _mensajes.add(_ChatMessage(texto: texto, esAgente: false));
      _cargando = true;
    });
    _scrollAlFinal();

    try {
      final respuesta = await _agente.enviarMensaje(
        mensaje: texto,
        historialChat: _historialChat,
        datosAcumulados: _datosAcumulados,
      );

      _historialChat = [
        ..._historialChat,
        {'rol': 'cliente', 'texto': texto},
        {'rol': 'agente', 'texto': respuesta.mensajeAgente},
      ];
      _datosAcumulados = respuesta.datosAcumulados;

      if (mounted) {
        setState(() {
          _mensajes.add(
            _ChatMessage(
              texto: respuesta.mensajeAgente,
              esAgente: true,
              flujoNombre: respuesta.flujoNombre,
              datosFaltantes: respuesta.datosFaltantes,
              instanciarAhora: respuesta.instanciarAhora,
              codigoTramite: respuesta.codigoTramite,
            ),
          );

          if (respuesta.instanciarAhora && respuesta.codigoTramite != null) {
            _codigoTramiteCreado = respuesta.codigoTramite;
          }
          _cargando = false;
        });
        _scrollAlFinal();
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _mensajes.add(
            _ChatMessage(
              texto: 'Lo siento, hubo un error de conexión. Intenta de nuevo.',
              esAgente: true,
              esError: true,
            ),
          );
          _cargando = false;
        });
        _scrollAlFinal();
      }
    }
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF1F5F9),
      appBar: _buildAppBar(),
      body: Column(
        children: [
          if (_codigoTramiteCreado != null) _buildSuccessBanner(),
          Expanded(child: _buildMensajes()),
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
        onPressed: () => Navigator.pop(context),
      ),
      title: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.2),
              borderRadius: BorderRadius.circular(18),
            ),
            child: const Icon(
              Icons.smart_toy_outlined,
              color: Colors.white,
              size: 20,
            ),
          ),
          const SizedBox(width: 10),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Asistente Colony',
                style: GoogleFonts.inter(
                  color: Colors.white,
                  fontWeight: FontWeight.w700,
                  fontSize: 15,
                ),
              ),
              Text(
                'Agente Inteligente IA',
                style: GoogleFonts.inter(color: Colors.white70, fontSize: 11),
              ),
            ],
          ),
        ],
      ),
      actions: [
        IconButton(
          icon: const Icon(Icons.refresh, color: Colors.white),
          tooltip: 'Nueva conversación',
          onPressed: () => setState(() {
            _mensajes.clear();
            _historialChat = [];
            _datosAcumulados = {};
            _codigoTramiteCreado = null;
            _mensajes.add(
              _ChatMessage(
                texto:
                    '¡Hola! 👋 Conversación reiniciada. ¿En qué trámite puedo ayudarte?',
                esAgente: true,
              ),
            );
          }),
        ),
      ],
    );
  }

  Widget _buildSuccessBanner() {
    return GestureDetector(
      onTap: () {
        Clipboard.setData(ClipboardData(text: _codigoTramiteCreado!));
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('¡Código copiado al portapapeles!'),
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
                  Text(
                    '¡Trámite iniciado!',
                    style: GoogleFonts.inter(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                      fontSize: 13,
                    ),
                  ),
                  Text(
                    'Código: $_codigoTramiteCreado  •  Toca para copiar',
                    style: GoogleFonts.inter(
                      color: Colors.white70,
                      fontSize: 11,
                    ),
                  ),
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
        mainAxisAlignment: isAgent
            ? MainAxisAlignment.start
            : MainAxisAlignment.end,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          if (isAgent) ...[
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
          ],
          Flexible(
            child: Column(
              crossAxisAlignment: isAgent
                  ? CrossAxisAlignment.start
                  : CrossAxisAlignment.end,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 10,
                  ),
                  decoration: BoxDecoration(
                    color: isAgent
                        ? (msg.esError ? const Color(0xFFFEE2E2) : Colors.white)
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
                      horizontal: 10,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: const Color(0xFFDBEAFE),
                      borderRadius: BorderRadius.circular(100),
                    ),
                    child: Text(
                      '📋 ${msg.flujoNombre}',
                      style: GoogleFonts.inter(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: const Color(0xFF1E40AF),
                      ),
                    ),
                  ),
                if (msg.instanciarAhora && msg.codigoTramite != null)
                  Container(
                    margin: const EdgeInsets.only(top: 4),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: const Color(0xFFDCFCE7),
                      borderRadius: BorderRadius.circular(100),
                    ),
                    child: Text(
                      '✅ Trámite: ${msg.codigoTramite}',
                      style: GoogleFonts.inter(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: const Color(0xFF166534),
                      ),
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
            child: const Icon(
              Icons.smart_toy_outlined,
              color: Colors.white,
              size: 16,
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
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
              children: [_buildDot(0), _buildDot(1), _buildDot(2)],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDot(int index) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0.0, end: 1.0),
      duration: Duration(milliseconds: 600 + index * 200),
      builder: (context, value, child) {
        return Container(
          width: 8,
          height: 8,
          margin: const EdgeInsets.symmetric(horizontal: 2),
          decoration: BoxDecoration(
            color: Color.lerp(
              const Color(0xFF94A3B8),
              const Color(0xFF1D4ED8),
              value,
            ),
            borderRadius: BorderRadius.circular(4),
          ),
        );
      },
    );
  }

  void _toggleListening() async {
    if (!_isListening) {
      bool micStatus = await Permission.microphone.request().isGranted;
      if (micStatus) {
        bool available = await _speechToText.initialize(
          onError: (val) => print('Error en voz: $val'),
          onStatus: (val) {
            if (val == 'done' || val == 'notListening') {
              if (mounted) setState(() => _isListening = false);
            }
          },
        );
        if (available) {
          setState(() => _isListening = true);
          _speechToText.listen(
            onResult: (result) {
              setState(() {
                _inputController.text = result.recognizedWords;
              });
            },
            localeId: 'es_US',
          );
        }
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Permiso de micrófono denegado.')),
        );
      }
    } else {
      setState(() => _isListening = false);
      _speechToText.stop();
    }
  }

  Widget _buildInputArea() {
    return Container(
      padding: const EdgeInsets.only(left: 16, right: 16, top: 12, bottom: 16),
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
        child: Row(
          children: [
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
                onPressed: _cargando || _codigoTramiteCreado != null
                    ? null
                    : _toggleListening,
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
                enabled: !_cargando && _codigoTramiteCreado == null,
                maxLines: 3,
                minLines: 1,
                textInputAction: TextInputAction.send,
                onSubmitted: (_) => _enviarMensaje(),
                style: GoogleFonts.inter(fontSize: 14),
                decoration: InputDecoration(
                  hintText: _isListening
                      ? 'Escuchando...'
                      : (_codigoTramiteCreado != null
                            ? 'Trámite iniciado ↑'
                            : 'Describe tu trámite...'),
                  hintStyle: GoogleFonts.inter(
                    color: _isListening
                        ? const Color(0xFFEF4444)
                        : const Color(0xFF94A3B8),
                  ),
                  filled: true,
                  fillColor: const Color(0xFFF8FAFC),
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 10,
                  ),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(24),
                    borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(24),
                    borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(24),
                    borderSide: const BorderSide(
                      color: Color(0xFF1D4ED8),
                      width: 1.5,
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
            AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              width: 48,
              height: 48,
              child: ElevatedButton(
                onPressed: (_cargando || _codigoTramiteCreado != null)
                    ? null
                    : _enviarMensaje,
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
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Icon(
                        Icons.send_rounded,
                        color: Colors.white,
                        size: 20,
                      ),
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
  final bool instanciarAhora;
  final String? codigoTramite;

  _ChatMessage({
    required this.texto,
    required this.esAgente,
    this.esError = false,
    this.flujoNombre,
    this.datosFaltantes = const [],
    this.instanciarAhora = false,
    this.codigoTramite,
  });
}
