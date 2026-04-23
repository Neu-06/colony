package com.colony.core.infrastructure.controller;

import com.colony.core.application.dto.PoliticaPublicadaResumenDto;
import com.colony.core.application.PoliticaService;
import com.colony.core.domain.PoliticaNegocio;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/politicas")
@RequiredArgsConstructor
public class PoliticaController {

    private final PoliticaService politicaService;

    @PostMapping
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'ADMIN')")
    public ResponseEntity<PoliticaNegocio> guardarPolitica(@Valid @RequestBody PoliticaNegocio politica) {
        PoliticaNegocio saved = politicaService.guardarPolitica(politica);
        return ResponseEntity.status(HttpStatus.CREATED).body(saved);
    }

    @GetMapping("/mis-borradores")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'ADMIN', 'FUNCIONARIO')")
    public ResponseEntity<List<PoliticaNegocio>> misBorradores() {
        return ResponseEntity.ok(politicaService.listarMisBorradores());
    }

    @GetMapping("/publicadas")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'ADMIN', 'FUNCIONARIO')")
    public ResponseEntity<List<PoliticaPublicadaResumenDto>> listarPublicadas() {
        return ResponseEntity.ok(politicaService.listarPublicadas());
    }

    @GetMapping("/publicadas/{id}")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'ADMIN', 'FUNCIONARIO')")
    public ResponseEntity<PoliticaNegocio> obtenerPoliticaPublicada(@PathVariable String id) {
        return ResponseEntity.ok(politicaService.obtenerPoliticaPublicada(id));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'ADMIN', 'FUNCIONARIO')")
    public ResponseEntity<PoliticaNegocio> obtenerPoliticaPorId(@PathVariable String id) {
        return ResponseEntity.ok(politicaService.obtenerPoliticaPropia(id));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'ADMIN', 'FUNCIONARIO')")
    public ResponseEntity<Void> eliminarPolitica(@PathVariable String id) {
        politicaService.eliminarPoliticaPropia(id);
        return ResponseEntity.noContent().build();
    }
}
