package com.colony.core.application.dto;

import jakarta.validation.constraints.NotBlank;

public record UsuarioAsignacionRequest(
        @NotBlank String rol,
        @NotBlank String departamentoId
) {
}
