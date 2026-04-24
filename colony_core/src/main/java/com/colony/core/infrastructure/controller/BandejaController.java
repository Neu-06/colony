package com.colony.core.infrastructure.controller;

import com.colony.core.application.BandejaService;
import com.colony.core.application.dto.BandejaItemDto;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/bandeja")
@RequiredArgsConstructor
public class BandejaController {

    private final BandejaService bandejaService;

    @GetMapping("/{departamentoId}")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'ADMIN', 'FUNCIONARIO')")
    public ResponseEntity<List<BandejaItemDto>> listarBandeja(@PathVariable String departamentoId) {
        return ResponseEntity.ok(bandejaService.listarBandejaPorDepartamento(departamentoId));
    }

    @PutMapping("/tomar/{instanciaId}/{usuarioId}")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'ADMIN', 'FUNCIONARIO')")
    public ResponseEntity<Void> tomarTramite(
            @PathVariable String instanciaId,
            @PathVariable String usuarioId
    ) {
        bandejaService.tomarTramite(instanciaId, usuarioId);
        return ResponseEntity.noContent().build();
    }
}
