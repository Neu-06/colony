package com.colony.core.application.dto;

public record AuthUsuarioDto(
        String id,
        String email,
        String rol,
        String departamentoId
) {
}
