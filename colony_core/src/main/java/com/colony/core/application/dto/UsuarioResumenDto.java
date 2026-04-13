package com.colony.core.application.dto;

public record UsuarioResumenDto(
        String id,
        String nombres,
        String apellidos,
        String email,
        String rol,
        String departamento,
        String telefono,
        Boolean activo
) {
}
