package com.colony.core.infrastructure.repository;

import com.colony.core.domain.PoliticaNegocio;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface PoliticaNegocioRepository extends MongoRepository<PoliticaNegocio, String> {
}
