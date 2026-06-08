package com.colony.core.infrastructure.controller;

import com.colony.core.application.AgenteClienteService;
import com.colony.core.application.DocumentoService;
import com.colony.core.domain.DocumentoRef;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;


@RestController
@RequestMapping("/api/agente")
@RequiredArgsConstructor
public class AgenteClienteController {

    private final AgenteClienteService agenteClienteService;
    private final DocumentoService documentoService;

    @GetMapping("/flujos")
    public ResponseEntity<List<Map<String, Object>>> listarFlujos() {
        return ResponseEntity.ok(agenteClienteService.obtenerFlujosPublicados());
    }

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

    @PostMapping(value = "/subir-documento/{instanciaId}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<DocumentoRef> subirDocumentoPublico(
            @PathVariable String instanciaId,
            @RequestParam("archivo") MultipartFile archivo) {
        
        // Se sube a nombre de 'cliente-anonimo' ya que es un inicio público
        DocumentoRef ref = documentoService.subirDocumento(instanciaId, archivo, "cliente-anonimo", "cliente-anonimo");
        return ResponseEntity.ok(ref);
    }
}
