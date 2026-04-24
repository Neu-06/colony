package com.colony.core.application.dto;

import jakarta.validation.constraints.NotBlank;
import java.util.Map;

public record IniciarInstanciaRequest(
        @NotBlank String politicaId,
        @NotBlank String usuarioIniciadorId,
        Map<String, Object> datosIniciales
) {
}
