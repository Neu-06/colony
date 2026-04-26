package com.colony.core.infrastructure.controller;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;

import java.util.Map;

/**
 * Proxy que recibe el JSON del canvas de Angular y lo reenvía
 * al microservicio de IA (colony_ai, Python/FastAPI).
 * No tiene lógica de negocio: solo actúa como pasarela segura.
 */
@Slf4j
@RestController
@RequestMapping("/api/ia")
@RequiredArgsConstructor
public class IAController {

    private static final String IA_SERVICE_URL = "http://localhost:8000/api/v1/recommend";

    private final RestTemplate restTemplate;

    /**
     * Recibe el JSON del canvas (PoliticaNegocio) y lo reenvía al motor de IA
     * Python.
     * Devuelve la respuesta tal cual la entregó el microservicio de IA.
     *
     * @param canvasData El JSON del canvas recibido desde el frontend Angular.
     * @return Análisis de IA: faltaInicio, faltaFin, nodosSinConexion, sugerencias.
     */
    @PostMapping("/analizar-canvas")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'ADMIN')")
    public ResponseEntity<?> analizarCanvas(@RequestBody Object canvasData) {
        try {
            log.info("Recibida solicitud de análisis IA. Reenviando a {}", IA_SERVICE_URL);

            // El microservicio Python espera: { "data": { ...canvas... } }
            Map<String, Object> payload = Map.of("data", canvasData);

            ResponseEntity<Object> iaResponse = restTemplate.postForEntity(
                    IA_SERVICE_URL,
                    payload,
                    Object.class);

            log.info("Respuesta de IA recibida con status: {}", iaResponse.getStatusCode());
            return ResponseEntity.ok(iaResponse.getBody());

        } catch (ResourceAccessException e) {
            // El microservicio Python está apagado o inaccesible
            log.warn("Motor de IA no disponible: {}", e.getMessage());
            return ResponseEntity
                    .status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("error",
                            "El motor de IA no está disponible. Asegúrate de que colony_ai esté ejecutándose."));
        } catch (Exception e) {
            log.error("Error inesperado al llamar al motor de IA", e);
            return ResponseEntity
                    .status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Error interno al procesar la solicitud de IA: " + e.getMessage()));
        }
    }
}
