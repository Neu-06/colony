package com.colony.core.infrastructure.adapter;

import com.colony.core.application.ports.AiClientePort;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Map;


@Slf4j
@Component
public class AiClienteAdapter implements AiClientePort {

    private final RestTemplate restTemplate;
    private final String aiBaseUrl;

    public AiClienteAdapter(
            @Value("${app.ai.recommend-url:http://localhost:8000/api/v1/recommend}") String recommendUrl) {
        this.restTemplate = new RestTemplate();
        this.aiBaseUrl = recommendUrl.replaceAll("/api/v1/.*$", "");
    }

    @Override
    public Map<String, Object> analizarIntencion(
            String mensaje,
            List<Map<String, String>> historialChat,
            List<Map<String, Object>> flujos,
            Map<String, Object> datosAcumulados
    ) {
        String url = aiBaseUrl + "/api/v1/cliente/analizar-intencion";

        Map<String, Object> requestBody = Map.of(
                "mensaje", mensaje,
                "historialChat", historialChat != null ? historialChat : List.of(),
                "flujos", flujos,
                "datosAcumulados", datosAcumulados != null ? datosAcumulados : Map.of()
        );

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);

        try {
            ResponseEntity<Map<String, Object>> response = restTemplate.exchange(
                    url,
                    HttpMethod.POST,
                    entity,
                    new ParameterizedTypeReference<>() {}
            );
            log.info("[AiCliente] Intención analizada: flujo={}, instanciar={}",
                    response.getBody() != null ? response.getBody().get("flujoDetectado") : "?",
                    response.getBody() != null ? response.getBody().get("instanciarAhora") : "?");
            return response.getBody() != null ? response.getBody() : Map.of();
        } catch (Exception e) {
            log.error("[AiCliente] Error llamando al microservicio AI: {}", e.getMessage());
            return Map.of(
                    "flujoDetectado", null,
                    "flujoNombre", null,
                    "datosExtraidos", Map.of(),
                    "datosFaltantes", List.of(),
                    "preguntaSugerida", null,
                    "instanciarAhora", false,
                    "mensajeAgente", "Lo siento, no pude procesar tu solicitud en este momento. ¿Puedes intentarlo de nuevo?",
                    "confianza", "baja"
            );
        }
    }
}
