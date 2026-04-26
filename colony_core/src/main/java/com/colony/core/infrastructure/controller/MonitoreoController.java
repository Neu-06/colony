package com.colony.core.infrastructure.controller;

import com.colony.core.domain.Instancia;
import com.colony.core.domain.PoliticaNegocio;
import com.colony.core.infrastructure.repository.InstanciaRepository;
import com.colony.core.infrastructure.repository.PoliticaNegocioRepository;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/monitoreo")
@RequiredArgsConstructor
public class MonitoreoController {

    private final InstanciaRepository instanciaRepository;
    private final PoliticaNegocioRepository politicaNegocioRepository;

    @GetMapping("/instancias")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'ADMIN', 'FUNCIONARIO')")
    public ResponseEntity<List<Map<String, Object>>> listarInstanciasAgrupadas() {
        List<Instancia> instancias = instanciaRepository.findAll();
        Map<String, Map<String, Object>> grupos = new HashMap<>();

        for (Instancia inst : instancias) {
            String politicaId = inst.getPoliticaId();
            if (politicaId == null) continue;

            if (!grupos.containsKey(politicaId)) {
                String nombre = politicaId;
                PoliticaNegocio politica = politicaNegocioRepository.findById(politicaId).orElse(null);
                if (politica != null && politica.getNombre() != null) {
                    nombre = politica.getNombre();
                }
                Map<String, Object> grupo = new HashMap<>();
                grupo.put("politicaId", politicaId);
                grupo.put("politicaNombre", nombre);
                grupo.put("instancias", new ArrayList<Map<String, Object>>());
                grupos.put(politicaId, grupo);
            }

            String nodoActualId = (inst.getNodosActualesIds() == null || inst.getNodosActualesIds().isEmpty())
                    ? "—"
                    : inst.getNodosActualesIds().get(0);

            Map<String, Object> instMap = new HashMap<>();
            instMap.put("instanciaId", inst.getId());
            instMap.put("codigo", inst.getCodigo());
            instMap.put("estadoGeneral", inst.getEstadoGeneral());
            instMap.put("semaforo", inst.getSemaforo() != null ? inst.getSemaforo() : "ROJO");
            instMap.put("nodoActualId", nodoActualId);
            instMap.put("fechaInicio", inst.getFechaInicio());

            @SuppressWarnings("unchecked")
            List<Map<String, Object>> lista = (List<Map<String, Object>>) grupos.get(politicaId).get("instancias");
            lista.add(instMap);
        }

        return ResponseEntity.ok(new ArrayList<>(grupos.values()));
    }
}
