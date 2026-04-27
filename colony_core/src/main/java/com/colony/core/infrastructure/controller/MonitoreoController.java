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
    private final com.colony.core.infrastructure.repository.HistorialRepository historialRepository;

    @GetMapping("/instancias")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'ADMIN', 'FUNCIONARIO')")
    public ResponseEntity<List<Map<String, Object>>> listarInstanciasAgrupadas() {
        List<Instancia> instancias = instanciaRepository.findAll();
        Map<String, Map<String, Object>> grupos = new HashMap<>();

        // Cache de políticas para no re-consultar
        Map<String, PoliticaNegocio> politicaCache = new HashMap<>();

        for (Instancia inst : instancias) {
            String politicaId = inst.getPoliticaId();
            if (politicaId == null) continue;

            PoliticaNegocio politica = politicaCache.computeIfAbsent(politicaId, 
                id -> politicaNegocioRepository.findById(id).orElse(null));

            if (!grupos.containsKey(politicaId)) {
                Map<String, Object> grupo = new HashMap<>();
                grupo.put("politicaId", politicaId);
                grupo.put("politicaNombre", politica != null ? politica.getNombre() : politicaId);
                grupo.put("instancias", new ArrayList<Map<String, Object>>());
                grupos.put(politicaId, grupo);
            }

            // Enriquecer nombres de tareas actuales
            List<String> tareasNombres = new ArrayList<>();
            if (politica != null && inst.getNodosActualesIds() != null && !inst.getNodosActualesIds().isEmpty()) {
                for (String nodoId : inst.getNodosActualesIds()) {
                    com.colony.core.domain.NodoBase nodo = politica.getNodos().stream()
                        .filter(n -> n.getIdNodo().equals(nodoId)).findFirst().orElse(null);
                    
                    if (nodo != null) {
                        String nombreTarea = nodo.getNombre();
                        String nombreDepto = "Sin Carril";
                        if (nodo.getCarrilId() != null && politica.getCarriles() != null) {
                            nombreDepto = politica.getCarriles().stream()
                                .filter(c -> c.getId().equals(nodo.getCarrilId()))
                                .map(com.colony.core.domain.Carril::getNombre)
                                .findFirst().orElse("Sin Carril");
                        }
                        tareasNombres.add(nombreTarea + " (" + nombreDepto + ")");
                    }
                }
            } else {
                tareasNombres.add("Ninguna / Trámite Cerrado");
            }

            Map<String, Object> instMap = new HashMap<>();
            instMap.put("instanciaId", inst.getId());
            instMap.put("codigo", inst.getCodigo());
            instMap.put("estadoGeneral", inst.getEstadoGeneral());
            instMap.put("semaforo", calcularSemaforo(inst));
            instMap.put("nodosActualesIds", inst.getNodosActualesIds());
            instMap.put("tareasActualesNombres", tareasNombres);
            instMap.put("fechaInicio", inst.getFechaInicio());

            @SuppressWarnings("unchecked")
            List<Map<String, Object>> lista = (List<Map<String, Object>>) grupos.get(politicaId).get("instancias");
            lista.add(instMap);
        }

        return ResponseEntity.ok(new ArrayList<>(grupos.values()));
    }

    private String calcularSemaforo(Instancia inst) {
        if ("FINALIZADO".equalsIgnoreCase(inst.getEstadoGeneral())) {
            return "VERDE";
        }

        // Si está en proceso, evaluamos la última transición
        com.colony.core.domain.Historial ultima = historialRepository.findFirstByInstanciaIDOrderByFechaTransicionDesc(inst.getId());
        java.util.Date referencia = (ultima != null && ultima.getFechaTransicion() != null) 
            ? ultima.getFechaTransicion() 
            : inst.getFechaInicio();

        if (referencia == null) return "AMARILLO";

        long diff = new java.util.Date().getTime() - referencia.getTime();
        long horas = diff / (1000 * 60 * 60);

        return horas > 24 ? "ROJO" : "AMARILLO";
    }
}
