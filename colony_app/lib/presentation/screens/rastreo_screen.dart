import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:permission_handler/permission_handler.dart';

import '../../data/providers/api_provider.dart';
import '../../data/repositories_impl/rastreo_repository_impl.dart';
import '../../domain/models/instancia_tracking.dart';
import '../../domain/repositories/rastreo_repository.dart';
import '../widgets/timeline_widget.dart';

class RastreoScreen extends StatefulWidget {
  const RastreoScreen({super.key});

  @override
  State<RastreoScreen> createState() => _RastreoScreenState();
}

class _RastreoScreenState extends State<RastreoScreen> {
  final TextEditingController _codigoController = TextEditingController();
  final RastreoRepository _repository = RastreoRepositoryImpl(
    const ApiProvider(),
  );

  InstanciaTracking? _tracking;
  String? _error;
  bool _loading = false;

  @override
  void dispose() {
    _codigoController.dispose();
    super.dispose();
  }

  Future<void> _consultar() async {
    final codigo = _codigoController.text.trim();
    if (codigo.isEmpty) {
      setState(() {
        _error = 'Por favor, ingresa un código de trámite';
        _tracking = null;
      });
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
      _tracking = null;
    });

    try {
      final result = await _repository.rastrear(codigo);
      if (!mounted) return;
      setState(() {
        _tracking = result;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = 'No se encontró el trámite o hubo un error de conexión';
      });
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
        });
      }
    }
  }

  Future<void> _solicitarNotificaciones() async {
    if (_tracking == null) return;

    final status = await Permission.notification.request();

    if (!mounted) return;

    if (status.isGranted) {
      setState(() => _loading = true);
      try {
        // PREPARADO PARA FIREBASE:
        // En el futuro, reemplaza este mockToken con:
        // String? token = await FirebaseMessaging.instance.getToken();
        const String mockToken = "DEVICE_MOCK_TOKEN_12345";

        await _repository.suscribirDispositivo(_tracking!.codigo, mockToken);

        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('¡Excelente! Te avisaremos cuando tu trámite avance.'),
            backgroundColor: Color(0xFF1D4ED8),
          ),
        );
      } catch (e) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error al activar notificaciones: $e')),
        );
      } finally {
        if (mounted) setState(() => _loading = false);
      }
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Necesitamos permiso para enviarte notificaciones')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      body: CustomScrollView(
        slivers: [
          _buildAppBar(),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.all(24.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _buildSearchCard(),
                  if (_error != null) _buildError(),
                  if (_loading) _buildLoader(),
                  if (_tracking != null) ...[
                    const SizedBox(height: 32),
                    _buildNotificationBanner(),
                    const SizedBox(height: 24),
                    _buildTrackingResult(),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAppBar() {
    return SliverAppBar(
      expandedHeight: 120.0,
      floating: false,
      pinned: true,
      backgroundColor: const Color(0xFF1D4ED8),
      flexibleSpace: FlexibleSpaceBar(
        titlePadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(
              width: 24,
              height: 24,
              child: CustomPaint(painter: ColonyLogoPainter()),
            ),
            const SizedBox(width: 8),
            Text(
              'Colony',
              style: GoogleFonts.inter(
                fontWeight: FontWeight.w700,
                color: Colors.white,
              ),
            ),
          ],
        ),
        background: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFF1D4ED8), Color(0xFF1E40AF)],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildSearchCard() {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 15,
            offset: const Offset(0, 5),
          ),
        ],
      ),
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Ingresa tu código',
            style: GoogleFonts.inter(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: const Color(0xFF64748B),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _codigoController,
            style: GoogleFonts.inter(fontWeight: FontWeight.w600),
            decoration: InputDecoration(
              hintText: 'Ej: TRM-123',
              filled: true,
              fillColor: const Color(0xFFF1F5F9),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide.none,
              ),
              prefixIcon: const Icon(Icons.search, color: Color(0xFF1D4ED8)),
            ),
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _loading ? null : _consultar,
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF1D4ED8),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                elevation: 0,
              ),
              child: Text(
                'Consultar Estado',
                style: GoogleFonts.inter(
                  fontWeight: FontWeight.w700,
                  fontSize: 16,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildNotificationBanner() {
    return Container(
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFFDBEAFE), Color(0xFFEFF6FF)],
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFBFDBFE)),
      ),
      padding: const EdgeInsets.all(16),
      child: Row(
        children: [
          const Icon(Icons.notifications_active_outlined, color: Color(0xFF1D4ED8)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '¿Deseas recibir notificaciones?',
                  style: GoogleFonts.inter(
                    fontWeight: FontWeight.w700,
                    color: const Color(0xFF1E40AF),
                  ),
                ),
                Text(
                  'Te avisaremos cuando tu caso cambie de estado.',
                  style: GoogleFonts.inter(
                    fontSize: 12,
                    color: const Color(0xFF1E40AF),
                  ),
                ),
              ],
            ),
          ),
          TextButton(
            onPressed: _solicitarNotificaciones,
            child: const Text('Activar'),
          ),
        ],
      ),
    );
  }

  Widget _buildTrackingResult() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              'Estado del Trámite',
              style: GoogleFonts.inter(
                fontSize: 20,
                fontWeight: FontWeight.w800,
                color: const Color(0xFF0F172A),
              ),
            ),
            _estadoChip(_tracking!.estadoGeneral),
          ],
        ),
        const SizedBox(height: 8),
        Text(
          'Código: ${_tracking!.codigo}',
          style: GoogleFonts.inter(
            color: const Color(0xFF64748B),
            fontWeight: FontWeight.w500,
          ),
        ),
        const SizedBox(height: 24),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: const Color(0xFFE2E8F0)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(Icons.location_on, color: Color(0xFF1D4ED8), size: 20),
                  const SizedBox(width: 8),
                  Text(
                    'Ubicación Actual',
                    style: GoogleFonts.inter(
                      fontWeight: FontWeight.w600,
                      color: const Color(0xFF64748B),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                _tracking!.nodoActual,
                style: GoogleFonts.inter(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: const Color(0xFF0F172A),
                ),
              ),
              const Divider(height: 32),
              TimelineWidget(items: _tracking!.historial),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildError() {
    return Padding(
      padding: const EdgeInsets.only(top: 16),
      child: Text(
        _error!,
        style: GoogleFonts.inter(
          color: const Color(0xFFEF4444),
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  Widget _buildLoader() {
    return const Padding(
      padding: const EdgeInsets.only(top: 24),
      child: Center(child: CircularProgressIndicator()),
    );
  }

  Widget _estadoChip(String estado) {
    final normalized = estado.trim().toUpperCase();
    Color color;
    String text;

    if (normalized == 'VERDE') {
      color = const Color(0xFF22C55E);
      text = 'FINALIZADO';
    } else if (normalized == 'AMARILLO') {
      color = const Color(0xFFF59E0B);
      text = 'EN PROCESO';
    } else {
      color = const Color(0xFFEF4444);
      text = 'NUEVO';
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(100),
        border: Border.all(color: color.withOpacity(0.2)),
      ),
      child: Text(
        text,
        style: GoogleFonts.inter(
          color: color,
          fontWeight: FontWeight.w700,
          fontSize: 12,
        ),
      ),
    );
  }
}

class ColonyLogoPainter extends CustomPainter {
  const ColonyLogoPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final double scale = size.width / 100;

    // Path
    final Paint pathPaint = Paint()
      ..color = const Color(0xFF38BDF8)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 12 * scale
      ..strokeCap = StrokeCap.round;

    final Path path = Path();
    path.moveTo(75 * scale, 25 * scale);
    path.quadraticBezierTo(20 * scale, 25 * scale, 20 * scale, 50 * scale);
    path.quadraticBezierTo(20 * scale, 75 * scale, 75 * scale, 75 * scale);
    canvas.drawPath(path, pathPaint);

    // Top Circle
    final Paint bluePaint = Paint()..color = const Color(0xFF3B82F6);
    canvas.drawCircle(Offset(75 * scale, 25 * scale), 12 * scale, bluePaint);

    // Middle Circle (light)
    final Paint lightPaint = Paint()..color = const Color(0xFFE0F2FE);
    canvas.drawCircle(Offset(32 * scale, 50 * scale), 12 * scale, lightPaint);

    // Bottom Circle
    canvas.drawCircle(Offset(75 * scale, 75 * scale), 12 * scale, bluePaint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
