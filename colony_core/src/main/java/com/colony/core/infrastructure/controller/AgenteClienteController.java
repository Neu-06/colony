package com.colony.core.infrastructure.controller;

import com.colony.core.application.AgenteClienteService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;


@RestController
@RequestMapping("/api/agente")
@RequiredArgsConstructor
public class AgenteClienteController {

    private final AgenteClienteService agenteClienteService;

    @PostMapping("/chat")
    public ResponseEntity<Map<String, Object>> chat(@RequestBody Map<String, Object> body) {

        String mensaje = (String) body.getOrDefault("mensaje", "");
        @SuppressWarnings("unchecked")
        List<Map<String, String>> historialChat = (List<Map<String, String>>) body.getOrDefault("historialChat", List.of());
        @SuppressWarnings("unchecked")
        Map<String, Object> datosAcumulados = (Map<String, Object>) body.getOrDefault("datosAcumulados", Map.of());
        String identificadorCliente = (String) body.getOrDefault("identificadorCliente", null);

        if (mensaje == null || mensaje.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of(
                    "mensajeAgente", "Por favor escribe un mensaje.",
                    "instanciarAhora", false
            ));
        }

        Map<String, Object> respuesta = agenteClienteService.procesarMensajeChat(
                mensaje, historialChat, datosAcumulados, identificadorCliente
        );
        return ResponseEntity.ok(respuesta);
    }
}
