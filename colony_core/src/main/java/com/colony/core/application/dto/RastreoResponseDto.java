package com.colony.core.application.dto;

import java.util.Date;
import java.util.List;

public record RastreoResponseDto(
        String codigo,
        String estadoGeneral,
        String nodoActual,
        Date fechaInicio,
        List<String> historial
) {
}
