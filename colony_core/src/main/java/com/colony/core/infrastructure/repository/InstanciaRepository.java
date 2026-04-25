package com.colony.core.infrastructure.repository;

import com.colony.core.domain.Instancia;
import java.util.List;
import java.util.Optional;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface InstanciaRepository extends MongoRepository<Instancia, String> {

    List<Instancia> findByEstadoGeneral(String estadoGeneral);

    List<Instancia> findByEstadoGeneralAndNodosActualesIdsIn(String estadoGeneral, List<String> nodosIds);

    Optional<Instancia> findByCodigo(String codigo);
}
