package com.colony.core.application.dto;

import jakarta.validation.constraints.NotBlank;
import java.util.Map;

public record AvanzarInstanciaRequest(
                @NotBlank String instanciaId,
                @NotBlank String usuarioId,
                String nodoId,
                Map<String, Object> datosNuevos) {
}
