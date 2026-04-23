package com.colony.core.application.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record DepartamentoRequest(
        @NotBlank @Size(min = 2, max = 80) String nombre
) {
}
