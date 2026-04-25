package com.colony.core.infrastructure.repository;

import com.colony.core.domain.Historial;
import java.util.List;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface HistorialRepository extends MongoRepository<Historial, String> {

	List<Historial> findByInstanciaIDOrderByFechaTransicionAsc(String instanciaID);
}
