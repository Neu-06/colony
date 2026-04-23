package com.colony.core.application.dto;

public record UsuarioResumenDto(
        String id,
        String nombres,
        String apellidos,
        String email,
        String rol,
        String departamentoId,
        String departamentoNombre,
        String telefono,
        Boolean activo
) {
}
