package com.colony.core.domain;

import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class Carril {

    private String id;
    private String nombre;
    private String departamentoId;
    private Integer orden;
}
