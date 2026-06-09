package com.colony.core.application.events;

import java.util.Map;

public record InstanciaAvanzadaEvent(
    String instanciaId,
    String politicaId,
    String nodoActualId,
    Map<String, Object> datosDinamicos,
    String usuarioEjecutor
) {}
