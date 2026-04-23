package com.colony.core.application.dto;

public record AuthUsuarioDto(
        String email,
        String rol,
        String departamentoId
) {
}
