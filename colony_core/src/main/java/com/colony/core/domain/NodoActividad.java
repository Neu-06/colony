package com.colony.core.domain;

import java.util.List;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
public class NodoActividad extends NodoBase {

    private String calleResponsable;
    private List<CampoForm> esquemaFormulario;
}
