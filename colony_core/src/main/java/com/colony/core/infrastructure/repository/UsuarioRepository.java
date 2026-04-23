package com.colony.core.infrastructure.repository;

import com.colony.core.domain.Usuario;
import java.util.Optional;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface UsuarioRepository extends MongoRepository<Usuario, String> {

	Optional<Usuario> findByEmail(String email);

	boolean existsByEmail(String email);

	long countByDepartamentoId(String departamentoId);
}
