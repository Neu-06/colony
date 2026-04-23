package com.colony.core.infrastructure.repository;

import com.colony.core.domain.Departamento;
import java.util.List;
import java.util.Optional;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface DepartamentoRepository extends MongoRepository<Departamento, String> {

    Optional<Departamento> findByNombreIgnoreCase(String nombre);

    boolean existsByNombreIgnoreCase(String nombre);

    List<Departamento> findAllByOrderByNombreAsc();
}
