package com.colony.core.application.dto;

public record AuthResponse(
	String token,
	AuthUsuarioDto usuario
) {
}
