package com.colony.core.application.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class MetricaRendimientoDTO {
    private String identificador;
    private String nombrePolitica;
    private String tipoNodo;
    private Double tiempoPromedioSegundos;
    private long cantidadTramites;
}
