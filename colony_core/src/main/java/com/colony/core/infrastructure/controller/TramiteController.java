package com.colony.core.infrastructure.controller;

import com.colony.core.application.TramiteService;
import com.colony.core.application.dto.PrimerFormularioDto;
import com.colony.core.application.dto.TramiteCatalogoDto;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/tramites")
@RequiredArgsConstructor
public class TramiteController {

    private final TramiteService tramiteService;

    @GetMapping("/publicados/{usuarioDepartamentoId}")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'ADMIN', 'FUNCIONARIO')")
    public ResponseEntity<List<TramiteCatalogoDto>> listarPublicados(@PathVariable String usuarioDepartamentoId) {
        return ResponseEntity.ok(tramiteService.listarPublicados(usuarioDepartamentoId));
    }

    @GetMapping("/{politicaId}/primer-formulario")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'ADMIN', 'FUNCIONARIO')")
    public ResponseEntity<PrimerFormularioDto> obtenerPrimerFormulario(@PathVariable String politicaId) {
        return ResponseEntity.ok(tramiteService.obtenerPrimerFormulario(politicaId));
    }
}
