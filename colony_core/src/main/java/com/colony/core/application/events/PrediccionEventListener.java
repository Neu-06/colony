package com.colony.core.application.events;

//import com.colony.core.domain.Instancia;
import com.colony.core.infrastructure.repository.InstanciaRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.event.EventListener;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.util.Map;

@Slf4j
@Component
public class PrediccionEventListener {

    private final InstanciaRepository instanciaRepository;
    private final RestTemplate restTemplate;
    private final String aiBaseUrl;

    public PrediccionEventListener(
            InstanciaRepository instanciaRepository,
            @Value("${app.ai.recommend-url:http://localhost:8000/api/v1/recommend}") String recommendUrl) {
        this.instanciaRepository = instanciaRepository;
        this.restTemplate = new RestTemplate();
        this.aiBaseUrl = recommendUrl.replaceAll("/api/v1/.*$", "");
    }

    @Async
    @EventListener
    public void handleInstanciaAvanzada(InstanciaAvanzadaEvent event) {
        log.info("[PrediccionEvent] Evaluando riesgo y anomalías para Instancia: {}", event.instanciaId());

        String url = aiBaseUrl + "/api/v1/prediccion/analizar";

        Map<String, Object> requestBody = Map.of(
                "instanciaId", event.instanciaId(),
                "politicaId", event.politicaId(),
                "nodoActualId", event.nodoActualId(),
                "datosDinamicos", event.datosDinamicos() != null ? event.datosDinamicos() : Map.of());

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);

        try {
            ResponseEntity<Map<String, Object>> response = restTemplate.exchange(
                    url, HttpMethod.POST, entity, new ParameterizedTypeReference<>() {
                    });

            Map<String, Object> body = response.getBody();
            if (body != null) {
                Double riesgo = (Double) body.getOrDefault("riesgo", 0.0);
                Integer prioridad = (Integer) body.getOrDefault("prioridad", 0);
                Boolean anomalia = (Boolean) body.getOrDefault("esAnomalia", false);

                // Actualizar instancia en DB
                instanciaRepository.findById(event.instanciaId()).ifPresent(inst -> {
                    inst.setScoreRiesgo(riesgo);
                    inst.setPrioridadAnalitica(prioridad);
                    inst.setAnomaliaDetectada(anomalia);

                    if (riesgo > 0.7 || anomalia) {
                        inst.setSemaforo("ROJO");
                    } else if (riesgo > 0.4) {
                        inst.setSemaforo("AMARILLO");
                    } else {
                        inst.setSemaforo("VERDE");
                    }

                    instanciaRepository.save(inst);
                    log.info("[PrediccionEvent] Instancia {} actualizada: Riesgo={}, Prioridad={}, Anomalía={}",
                            inst.getId(), riesgo, prioridad, anomalia);
                });
            }
        } catch (Exception e) {
            log.error("[PrediccionEvent] Error llamando a IA Predictiva: {}", e.getMessage());
        }
    }
}
