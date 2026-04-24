package com.colony.core.infrastructure.controller;

import com.colony.core.application.MotorInstanciaService;
import com.colony.core.application.dto.AtencionTramiteDto;
import com.colony.core.application.dto.AvanzarInstanciaRequest;
import com.colony.core.application.dto.IniciarInstanciaRequest;
import com.colony.core.application.dto.IniciarInstanciaResponse;
import com.colony.core.domain.Instancia;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/motor")
@RequiredArgsConstructor
public class MotorController {

    private final MotorInstanciaService motorInstanciaService;

    @GetMapping("/atencion/{instanciaId}")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'ADMIN', 'FUNCIONARIO')")
    public ResponseEntity<AtencionTramiteDto> obtenerAtencion(@PathVariable String instanciaId) {
        return ResponseEntity.ok(motorInstanciaService.obtenerAtencion(instanciaId));
    }

    @PostMapping("/avanzar")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'ADMIN', 'FUNCIONARIO')")
    public ResponseEntity<Instancia> avanzar(@Valid @RequestBody AvanzarInstanciaRequest request) {
        return ResponseEntity.ok(motorInstanciaService.avanzar(request));
    }

    @PostMapping("/iniciar")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'ADMIN', 'FUNCIONARIO')")
    public ResponseEntity<IniciarInstanciaResponse> iniciar(@Valid @RequestBody IniciarInstanciaRequest request) {
        return ResponseEntity.ok(motorInstanciaService.iniciar(request));
    }
}
