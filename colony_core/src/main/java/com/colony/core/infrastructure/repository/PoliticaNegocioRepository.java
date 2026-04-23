package com.colony.core.infrastructure.repository;

import com.colony.core.domain.PoliticaNegocio;
import java.util.List;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface PoliticaNegocioRepository extends MongoRepository<PoliticaNegocio, String> {

	List<PoliticaNegocio> findByCreadoPorAndEstadoOrderByFechaCreacionDesc(String creadoPor, String estado);

	List<PoliticaNegocio> findByEstadoOrderByFechaCreacionDesc(String estado);
}
