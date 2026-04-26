package com.colony.core.application.dto;

import java.util.Date;

public record BandejaItemDto(
        String instanciaId,
        String codigoTramite,
        Date fecha,
        String semaforo,
        String nombrePolitica,
        String nombreNodoActual
) {
}
