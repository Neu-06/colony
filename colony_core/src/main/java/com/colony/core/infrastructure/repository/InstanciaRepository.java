package com.colony.core.infrastructure.repository;

import com.colony.core.domain.Instancia;
import java.util.List;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface InstanciaRepository extends MongoRepository<Instancia, String> {

    List<Instancia> findByEstadoGeneral(String estadoGeneral);
}
