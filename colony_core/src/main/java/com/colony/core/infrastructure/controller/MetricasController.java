package com.colony.core.infrastructure.controller;

import com.colony.core.application.dto.KpiGeneralDTO;
import com.colony.core.application.dto.MetricaRendimientoDTO;
import com.colony.core.infrastructure.repository.DepartamentoRepository;
import com.colony.core.infrastructure.repository.UsuarioRepository;

import com.colony.core.infrastructure.repository.InstanciaRepository;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.aggregation.Aggregation;
import org.springframework.data.mongodb.core.aggregation.AggregationResults;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.CrossOrigin;

@RestController
@RequestMapping(value = "/api/metricas", produces = MediaType.APPLICATION_JSON_VALUE)
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class MetricasController {

    private final InstanciaRepository instanciaRepository;
    private final MongoTemplate mongoTemplate;
    private final UsuarioRepository usuarioRepository;
    private final DepartamentoRepository departamentoRepository;

    @GetMapping("/general")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'ADMIN')")
    public ResponseEntity<KpiGeneralDTO> getKpiGeneral() {
        long total = instanciaRepository.count();
        long enProceso = instanciaRepository.countByEstadoGeneral("EN_PROCESO");
        long finalizadas = instanciaRepository.countByEstadoGeneral("FINALIZADO");
        long totalDep = departamentoRepository.count();

        return ResponseEntity.ok(new KpiGeneralDTO(total, enProceso, finalizadas, totalDep));
    }

    @GetMapping("/rendimiento-usuarios")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'ADMIN')")
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
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'ADMIN')")
    public ResponseEntity<List<MetricaRendimientoDTO>> getCuellosBotella() {
        // Top 5 Cuellos de Botella (Promedio de resolución)
        Aggregation aggregation = Aggregation.newAggregation(
                Aggregation.match(Criteria.where("tiempoResolucionSegundos").gt(0)),
                Aggregation.group("nodoDestino")
                        .avg("tiempoResolucionSegundos").as("tiempoPromedioSegundos")
                        .count().as("cantidadTramites"),
                Aggregation.project("tiempoPromedioSegundos", "cantidadTramites")
                        .and("_id").as("identificador"),
                Aggregation.sort(Sort.Direction.DESC, "tiempoPromedioSegundos"),
                Aggregation.limit(5));

        AggregationResults<MetricaRendimientoDTO> results = mongoTemplate.aggregate(
                aggregation, "historial", MetricaRendimientoDTO.class);

        return ResponseEntity.ok(results.getMappedResults());
    }
}
