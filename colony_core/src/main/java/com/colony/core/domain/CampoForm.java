package com.colony.core.domain;

import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class CampoForm {

    private String nombre;
    private String tipo;
    private boolean requerido;
}
