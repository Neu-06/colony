package com.colony.core.infrastructure.controller;

import com.colony.core.application.dto.KpiGeneralDTO;
import com.colony.core.application.dto.MetricaRendimientoDTO;
import com.colony.core.infrastructure.repository.DepartamentoRepository;
import com.colony.core.infrastructure.repository.UsuarioRepository;

import com.colony.core.infrastructure.repository.InstanciaRepository;
import com.colony.core.infrastructure.repository.PoliticaNegocioRepository;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.aggregation.Aggregation;
import org.springframework.data.mongodb.core.aggregation.AggregationResults;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.http.MediaType;

@RestController
@RequestMapping(value = "/api/metricas", produces = MediaType.APPLICATION_JSON_VALUE)
@RequiredArgsConstructor
public class MetricasController {

    private final InstanciaRepository instanciaRepository;
    private final MongoTemplate mongoTemplate;
    private final UsuarioRepository usuarioRepository;
    private final DepartamentoRepository departamentoRepository;
    private final PoliticaNegocioRepository politicaNegocioRepository;

    @GetMapping("/general")
    public ResponseEntity<KpiGeneralDTO> getKpiGeneral() {
        long total = instanciaRepository.count();
        long enProceso = instanciaRepository.countByEstadoGeneral("EN_PROCESO");
        long finalizadas = instanciaRepository.countByEstadoGeneral("FINALIZADO");
        long totalDep = departamentoRepository.count();

        return ResponseEntity.ok(new KpiGeneralDTO(total, enProceso, finalizadas, totalDep));
    }

    @GetMapping("/rendimiento-usuarios")
    public ResponseEntity<List<MetricaRendimientoDTO>> getRendimientoUsuarios() {
        Aggregation aggregation = Aggregation.newAggregation(
                Aggregation.match(Criteria.where("ejecutadoPor").ne(null)),
                Aggregation.group("ejecutadoPor")
                        .count().as("cantidadTramites")
                        .sum("tiempoResolucionSegundos").as("tiempoPromedioSegundos"),
                Aggregation.project("cantidadTramites", "tiempoPromedioSegundos")
                        .and("_id").as("identificador"),
                Aggregation.sort(Sort.Direction.DESC, "cantidadTramites"),
                Aggregation.limit(5));

        AggregationResults<MetricaRendimientoDTO> results = mongoTemplate.aggregate(
                aggregation, "historial", MetricaRendimientoDTO.class);

        List<MetricaRendimientoDTO> lista = results.getMappedResults();

        // Traducción de IDs a Nombres (Priorizando Departamentos)
        lista.forEach(item -> {
            if (item.getIdentificador() != null) {
                usuarioRepository.findById(item.getIdentificador()).ifPresentOrElse(
                        u -> {
                            if (u.getDepartamentoId() != null) {
                                departamentoRepository.findById(u.getDepartamentoId()).ifPresentOrElse(
                                        d -> item.setIdentificador(d.getNombre()),
                                        () -> item.setIdentificador(u.getNombres() + " " + u.getApellidos()));
                            } else {
                                item.setIdentificador(u.getNombres() + " " + u.getApellidos());
                            }
                        },
                        () -> item.setIdentificador("Usuario Ext."));
            } else {
                item.setIdentificador("Sistema");
            }
        });

        return ResponseEntity.ok(lista);
    }

    @GetMapping("/cuellos-botella")
    public ResponseEntity<List<MetricaRendimientoDTO>> getCuellosBotella() {
        // Top 10 Cuellos de Botella (Promedio de resolución)
        Aggregation aggregation = Aggregation.newAggregation(
                Aggregation.match(Criteria.where("tiempoResolucionSegundos").gt(0)),
                Aggregation.group("politicaId", "nodoDestino")
                        .avg("tiempoResolucionSegundos").as("tiempoPromedioSegundos")
                        .count().as("cantidadTramites"),
                Aggregation.project("tiempoPromedioSegundos", "cantidadTramites")
                        .and("_id.politicaId").as("nombrePolitica")
                        .and("_id.nodoDestino").as("identificador"),
                Aggregation.sort(Sort.Direction.DESC, "tiempoPromedioSegundos"));

        AggregationResults<MetricaRendimientoDTO> results = mongoTemplate.aggregate(
                aggregation, "historial", MetricaRendimientoDTO.class);

        List<MetricaRendimientoDTO> lista = results.getMappedResults();

        // Mapear Nombres y Filtrar
        java.util.List<MetricaRendimientoDTO> listaFiltrada = new java.util.ArrayList<>();

        lista.forEach(item -> {
            if (item.getNombrePolitica() != null) {
                politicaNegocioRepository.findById(item.getNombrePolitica()).ifPresent(p -> {
                    item.setNombrePolitica(p.getNombre());
                    if (p.getNodos() != null) {
                        p.getNodos().stream()
                                .filter(n -> n.getIdNodo().equals(item.getIdentificador()))
                                .findFirst()
                                .ifPresent(n -> {
                                    item.setIdentificador(n.getNombre());
                                    item.setTipoNodo(n.getTipo());
                                });
                    }
                });
            }

            // Excluir nodos que no son áreas de trabajo
            if (item.getTipoNodo() != null &&
                    !item.getTipoNodo().equals("inicio") &&
                    !item.getTipoNodo().equals("fin") &&
                    !item.getTipoNodo().equals("compuerta") &&
                    !item.getTipoNodo().equals("join")) {
                listaFiltrada.add(item);
            }
        });

        // Retornar solo el Top 10 de áreas funcionales
        java.util.List<MetricaRendimientoDTO> top10 = listaFiltrada.stream()
                .limit(10)
                .collect(java.util.stream.Collectors.toList());

        return ResponseEntity.ok(top10);
    }

    @GetMapping("/anomalias")
    public ResponseEntity<List<com.colony.core.domain.Instancia>> getAnomaliasYRiesgos() {
        List<com.colony.core.domain.Instancia> anomalas = instanciaRepository
                .findByAnomaliaDetectadaTrueOrScoreRiesgoGreaterThanEqualOrderByScoreRiesgoDesc(0.6);
        return ResponseEntity.ok(anomalas);
    }
}
