package com.colony.core.application.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class KpiGeneralDTO {
    private long totalInstancias;
    private long enProceso;
    private long finalizadas;
}
