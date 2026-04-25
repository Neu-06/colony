package com.colony.core.infrastructure.controller;

import com.colony.core.application.RastreoService;
import com.colony.core.application.dto.RastreoResponseDto;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/rastreo")
@RequiredArgsConstructor
public class RastreoController {

    private final RastreoService rastreoService;

    @GetMapping("/{codigo}")
    public ResponseEntity<RastreoResponseDto> rastrear(@PathVariable String codigo) {
        return ResponseEntity.ok(rastreoService.rastrearPorCodigo(codigo));
    }

    @PostMapping("/{codigo}/suscribir")
    public ResponseEntity<Void> suscribir(@PathVariable String codigo, @RequestBody java.util.Map<String, String> request) {
        String deviceToken = request.get("token");
        rastreoService.suscribirDispositivo(codigo, deviceToken);
        return ResponseEntity.ok().build();
    }
}
