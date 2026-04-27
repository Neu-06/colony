package com.colony.core.infrastructure.controller;

import com.colony.core.application.dto.KpiGeneralDTO;
import com.colony.core.application.dto.MetricaRendimientoDTO;
import com.colony.core.infrastructure.repository.InstanciaRepository;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.aggregation.Aggregation;
import org.springframework.data.mongodb.core.aggregation.AggregationResults;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/metricas")
@RequiredArgsConstructor
public class MetricasController {

    private final InstanciaRepository instanciaRepository;
    private final MongoTemplate mongoTemplate;

    @GetMapping("/general")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'ADMIN')")
    public ResponseEntity<KpiGeneralDTO> getKpiGeneral() {
        long total = instanciaRepository.count();
        long enProceso = instanciaRepository.countByEstadoGeneral("EN_PROCESO");
        long finalizadas = instanciaRepository.countByEstadoGeneral("FINALIZADO");

        return ResponseEntity.ok(new KpiGeneralDTO(total, enProceso, finalizadas));
    }

    @GetMapping("/rendimiento-usuarios")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'ADMIN')")
    public ResponseEntity<List<MetricaRendimientoDTO>> getRendimientoUsuarios() {
        // Top 5 usuarios más productivos (por cantidad de tareas completadas)
        Aggregation aggregation = Aggregation.newAggregation(
            Aggregation.match(org.springframework.data.mongodb.core.query.Criteria.where("ejecutadoPor").ne(null)),
            Aggregation.group("ejecutadoPor")
                .count().as("cantidadTramites"),
            Aggregation.project("cantidadTramites")
                .and("_id").as("identificador"),
            Aggregation.sort(Sort.Direction.DESC, "cantidadTramites"),
            Aggregation.limit(5)
        );

        AggregationResults<MetricaRendimientoDTO> results = mongoTemplate.aggregate(
            aggregation, "historial", MetricaRendimientoDTO.class
        );

        return ResponseEntity.ok(results.getMappedResults());
    }

    @GetMapping("/cuellos-botella")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'ADMIN')")
    public ResponseEntity<List<MetricaRendimientoDTO>> getCuellosBotella() {
        // Top 5 tareas que más tiempo consumen (promedio tiempoResolucionSegundos)
        Aggregation aggregation = Aggregation.newAggregation(
            Aggregation.match(org.springframework.data.mongodb.core.query.Criteria.where("tiempoResolucionSegundos").gt(0)),
            Aggregation.group("nodoDestino")
                .avg("tiempoResolucionSegundos").as("tiempoPromedioSegundos")
                .count().as("cantidadTramites"),
            Aggregation.project("tiempoPromedioSegundos", "cantidadTramites")
                .and("_id").as("identificador"),
            Aggregation.sort(Sort.Direction.DESC, "tiempoPromedioSegundos"),
            Aggregation.limit(5)
        );

        AggregationResults<MetricaRendimientoDTO> results = mongoTemplate.aggregate(
            aggregation, "historial", MetricaRendimientoDTO.class
        );

        return ResponseEntity.ok(results.getMappedResults());
    }
}
