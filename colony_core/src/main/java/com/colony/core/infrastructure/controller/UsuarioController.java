package com.colony.core.infrastructure.controller;

import com.colony.core.application.dto.UsuarioAsignacionRequest;
import com.colony.core.application.dto.UsuarioResumenDto;
import com.colony.core.domain.Usuario;
import com.colony.core.infrastructure.repository.UsuarioRepository;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/usuarios")
@RequiredArgsConstructor
@PreAuthorize("hasRole('SUPER_ADMIN')")
public class UsuarioController {

    private static final String SUPER_ADMIN_EMAIL = "super@colony.com";
    private static final Set<String> ROLES_VALIDOS = Set.of("SUPER_ADMIN", "ADMIN", "FUNCIONARIO");

    private final UsuarioRepository usuarioRepository;

    @GetMapping
    public ResponseEntity<List<UsuarioResumenDto>> listarUsuarios() {
        List<UsuarioResumenDto> usuarios = usuarioRepository.findAll()
                .stream()
                .map(this::mapToResumen)
                .toList();

        return ResponseEntity.ok(usuarios);
    }

    @PutMapping("/{id}/asignar")
    public ResponseEntity<UsuarioResumenDto> asignarRolYDepartamento(
            @PathVariable String id,
            @Valid @RequestBody UsuarioAsignacionRequest request
    ) {
        Usuario usuario = usuarioRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));

        String rolNormalizado = normalizeUpper(request.rol());
        String departamentoNormalizado = normalizeUpper(request.departamento());

        if (!ROLES_VALIDOS.contains(rolNormalizado)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Rol no valido");
        }

        if (SUPER_ADMIN_EMAIL.equalsIgnoreCase(usuario.getEmail()) && !"SUPER_ADMIN".equals(rolNormalizado)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No se puede degradar el super admin principal");
        }

        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        String actorEmail = authentication != null ? authentication.getName() : "";

        if (usuario.getEmail() != null
                && usuario.getEmail().equalsIgnoreCase(actorEmail)
                && !"SUPER_ADMIN".equals(rolNormalizado)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No puedes quitarte el rol SUPER_ADMIN");
        }

        usuario.setRol(rolNormalizado);
        usuario.setDepartamento(departamentoNormalizado);

        Usuario updated = usuarioRepository.save(usuario);
        return ResponseEntity.ok(mapToResumen(updated));
    }

    private UsuarioResumenDto mapToResumen(Usuario usuario) {
        return new UsuarioResumenDto(
                usuario.getId(),
                usuario.getNombres(),
                usuario.getApellidos(),
                usuario.getEmail(),
                usuario.getRol(),
                usuario.getDepartamento(),
                usuario.getTelefono(),
                usuario.getActivo()
        );
    }

    private String normalizeUpper(String value) {
        return value.trim().toUpperCase(Locale.ROOT);
    }
}
