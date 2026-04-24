package com.colony.core.application.dto;

import com.colony.core.domain.CampoForm;
import java.util.List;

public record PrimerFormularioDto(
        String politicaId,
        String primeraTareaId,
        List<CampoForm> esquemaFormulario
) {
}
