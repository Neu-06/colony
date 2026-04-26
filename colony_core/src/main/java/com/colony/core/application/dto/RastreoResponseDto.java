package com.colony.core.application.dto;

import java.util.Date;
import java.util.List;

public record RastreoResponseDto(
        String codigo,
        String nombrePolitica,
        String estadoGeneral,
        String nodoActualId,
        String nombreNodoActual,
        Date fechaInicio,
        List<String> historial
) {
}
