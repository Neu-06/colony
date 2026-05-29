package com.colony.core.infrastructure.repository;

import com.colony.core.domain.AuditoriaDocumento;
import java.util.List;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface AuditoriaDocumentoRepository extends MongoRepository<AuditoriaDocumento, String> {

    List<AuditoriaDocumento> findByDocumentoIdOrderByFechaDesc(String documentoId);

    List<AuditoriaDocumento> findByInstanciaIdOrderByFechaDesc(String instanciaId);
}
