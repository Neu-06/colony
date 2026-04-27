package com.colony.core.infrastructure.controller;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
//import org.springframework.http.HttpStatus;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.client.RestTemplate;

import java.util.Collections;
import java.util.List;
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

    @Value("${app.ai.recommend-url:http://localhost:8000/api/v1/recommend}")
    private String iaRecommendUrl;

    @Value("${app.ai.fix-url:http://localhost:8000/api/v1/fix}")
    private String iaFixUrl;

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
        return proxyToIA(iaRecommendUrl, canvasData);
    }

    /**
     * Reenvía el JSON al motor de IA para corregir errores estructurales.
     */
    @PostMapping("/corregir-canvas")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'ADMIN')")
    public ResponseEntity<?> corregirCanvas(@RequestBody Object canvasData) {
        return proxyToIA(iaFixUrl, canvasData);
    }

    /**
     * Método centralizado para llamar a la IA con manejo defensivo extremo.
     * NUNCA devuelve un error HTTP al frontend; en su lugar, devuelve un
     * objeto de respaldo con una advertencia en las sugerencias.
     */
    private ResponseEntity<?> proxyToIA(String url, Object canvasData) {
        try {
            log.info("Reenviando solicitud a {}", url);
            Map<String, Object> payload = Map.of("data", canvasData);

            ResponseEntity<Object> iaResponse = restTemplate.postForEntity(
                    url,
                    payload,
                    Object.class);

            return ResponseEntity.ok(iaResponse.getBody());

        } catch (RestClientResponseException | ResourceAccessException e) {
            // Captura 4xx, 5xx y errores de conexión
            log.warn("Error al contactar con la IA ({}): {}", url, e.getMessage());
            return ResponseEntity.ok(crearRespuestaDeRespaldo());
        } catch (Exception e) {
            log.error("Error inesperado en proxy de IA", e);
            return ResponseEntity.ok(crearRespuestaDeRespaldo());
        }
    }

    /**
     * Genera un JSON de éxito técnico pero con contenido de advertencia funcional.
     */
    private Map<String, Object> crearRespuestaDeRespaldo() {
        return Map.of(
                "faltaInicio", false,
                "faltaFin", false,
                "nodosSinConexion", Collections.emptyList(),
                "sugerencias",
                List.of("⚠️ El límite de la Inteligencia Artificial se ha agotado por seguridad. Por favor, intenta de nuevo en 1 minuto."));
    }
}
