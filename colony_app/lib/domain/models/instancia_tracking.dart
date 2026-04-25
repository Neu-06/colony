class InstanciaTracking {
  const InstanciaTracking({
    required this.codigo,
    required this.estadoGeneral,
    required this.nodoActual,
    required this.fechaInicio,
    required this.historial,
  });

  final String codigo;
  final String estadoGeneral;
  final String nodoActual;
  final DateTime? fechaInicio;
  final List<String> historial;

  factory InstanciaTracking.fromJson(Map<String, dynamic> json) {
    return InstanciaTracking(
      codigo: (json['codigo'] ?? '').toString(),
      estadoGeneral: (json['estadoGeneral'] ?? '').toString(),
      nodoActual: (json['nodoActual'] ?? '').toString(),
      fechaInicio: json['fechaInicio'] == null
          ? null
          : DateTime.tryParse(json['fechaInicio'].toString()),
      historial: (json['historial'] as List<dynamic>? ?? const [])
          .map((item) => item.toString())
          .toList(),
    );
  }
}
