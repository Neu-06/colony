package com.colony.core.application.dto;

import jakarta.validation.constraints.NotBlank;
import java.util.Map;

public record AvanzarInstanciaRequest(
        @NotBlank String instanciaId,
        Map<String, Object> datos
) {
}
