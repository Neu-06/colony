package com.colony.core.application.dto;

import java.util.Date;

public record PoliticaPublicadaResumenDto(
        String id,
        String nombre,
        Integer version,
        Date fechaCreacion,
        String publicadoPorNombre
) {
}
