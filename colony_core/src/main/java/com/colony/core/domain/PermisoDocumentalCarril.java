package com.colony.core.domain;

import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class PermisoDocumentalCarril {

    private String carrilId;
    private String carrilNombre;
    private PermisoDocumental permiso;
}
