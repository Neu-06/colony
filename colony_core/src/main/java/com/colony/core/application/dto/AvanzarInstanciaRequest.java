package com.colony.core.application.dto;

import jakarta.validation.constraints.NotBlank;
import java.util.Map;

public record AvanzarInstanciaRequest(
        @NotBlank String instanciaId,
        @NotBlank String nodoAvanzarId,
        @NotBlank String usuarioId,
        Map<String, Object> datos
) {
}
