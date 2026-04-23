package com.colony.core.infrastructure.controller;

import com.colony.core.application.dto.DepartamentoRequest;
import com.colony.core.domain.Departamento;
import com.colony.core.infrastructure.repository.DepartamentoRepository;
import com.colony.core.infrastructure.repository.UsuarioRepository;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/departamentos")
@RequiredArgsConstructor
public class DepartamentoController {

    private static final String ESTADO_ACTIVO = "ACTIVO";

    private final DepartamentoRepository departamentoRepository;
    private final UsuarioRepository usuarioRepository;

    @GetMapping
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'ADMIN', 'FUNCIONARIO')")
    public ResponseEntity<List<Departamento>> listarDepartamentos() {
        return ResponseEntity.ok(departamentoRepository.findAllByOrderByNombreAsc());
    }

    @PostMapping
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<Departamento> crearDepartamento(@Valid @RequestBody DepartamentoRequest request) {
        String nombre = normalizarNombre(request.nombre());

        if (departamentoRepository.existsByNombreIgnoreCase(nombre)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Ya existe un departamento con ese nombre");
        }

        Departamento departamento = new Departamento();
        departamento.setNombre(nombre);
        departamento.setActivo(ESTADO_ACTIVO);

        Departamento creado = departamentoRepository.save(departamento);
        return ResponseEntity.status(HttpStatus.CREATED).body(creado);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<Departamento> actualizarDepartamento(
            @PathVariable String id,
            @Valid @RequestBody DepartamentoRequest request
    ) {
        Departamento departamento = departamentoRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Departamento no encontrado"));

        String nombre = normalizarNombre(request.nombre());
        Departamento existentePorNombre = departamentoRepository.findByNombreIgnoreCase(nombre).orElse(null);
        if (existentePorNombre != null && !existentePorNombre.getId().equals(id)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Ya existe un departamento con ese nombre");
        }

        departamento.setNombre(nombre);
        if (departamento.getActivo() == null || departamento.getActivo().isBlank()) {
            departamento.setActivo(ESTADO_ACTIVO);
        }

        return ResponseEntity.ok(departamentoRepository.save(departamento));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<Void> eliminarDepartamento(@PathVariable String id) {
        Departamento departamento = departamentoRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Departamento no encontrado"));

        long usuariosAsignados = usuarioRepository.countByDepartamentoId(departamento.getId());
        if (usuariosAsignados > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "No se puede eliminar: hay usuarios asignados a este departamento");
        }

        departamentoRepository.deleteById(id);
        return ResponseEntity.noContent().build();
    }

    private String normalizarNombre(String nombre) {
        return nombre.trim();
    }
}
