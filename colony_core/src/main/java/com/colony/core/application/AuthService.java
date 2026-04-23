package com.colony.core.application;

import com.colony.core.application.dto.AuthRequest;
import com.colony.core.application.dto.AuthResponse;
import com.colony.core.application.dto.AuthUsuarioDto;
import com.colony.core.application.dto.RegisterRequest;
import com.colony.core.config.security.JwtService;
import com.colony.core.domain.Usuario;
import com.colony.core.infrastructure.repository.UsuarioRepository;
import java.util.Locale;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UsuarioRepository usuarioRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuthenticationManager authenticationManager;
    private final JwtService jwtService;

    public AuthResponse register(RegisterRequest request) {
        String email = normalizeEmail(request.email());

        if (usuarioRepository.existsByEmail(email)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "El email ya existe");
        }

        Usuario usuario = new Usuario();
        usuario.setNombres(request.nombres().trim());
        usuario.setEmail(email);
        usuario.setPassword(passwordEncoder.encode(request.password()));
        usuario.setRol("FUNCIONARIO");
        usuario.setDepartamentoId("SIN_ASIGNAR");

        Usuario saved = usuarioRepository.save(usuario);
        String token = jwtService.generateToken(saved);
        return new AuthResponse(token, mapAuthUser(saved));
    }

    public AuthResponse login(AuthRequest request) {
        String email = normalizeEmail(request.email());

        try {
            authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(email, request.password())
            );
        } catch (AuthenticationException ex) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Credenciales incorrectas");
        }

        Usuario usuario = usuarioRepository.findByEmail(email)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Credenciales incorrectas"));

        String token = jwtService.generateToken(usuario);
        return new AuthResponse(token, mapAuthUser(usuario));
    }

    private String normalizeEmail(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }

    private AuthUsuarioDto mapAuthUser(Usuario usuario) {
        String rol = (usuario.getRol() == null || usuario.getRol().isBlank()) ? "FUNCIONARIO" : usuario.getRol();
        String departamentoId = (usuario.getDepartamentoId() == null || usuario.getDepartamentoId().isBlank())
            ? "SIN_ASIGNAR"
            : usuario.getDepartamentoId();

        return new AuthUsuarioDto(
                usuario.getEmail(),
                rol,
                departamentoId
        );
    }
}
