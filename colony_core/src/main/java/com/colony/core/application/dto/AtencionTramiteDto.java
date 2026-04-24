package com.colony.core.application.dto;

import com.colony.core.domain.CampoForm;
import java.util.List;
import java.util.Map;

public record AtencionTramiteDto(
        String instanciaId,
        String codigoTramite,
        String nodoActualId,
        Map<String, Object> datosDinamicos,
        List<CampoForm> esquemaFormulario
) {
}
