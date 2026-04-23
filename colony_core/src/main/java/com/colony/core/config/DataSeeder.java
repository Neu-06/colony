package com.colony.core.config;

import com.colony.core.domain.Departamento;
import com.colony.core.domain.Usuario;
import com.colony.core.infrastructure.repository.DepartamentoRepository;
import com.colony.core.infrastructure.repository.UsuarioRepository;
import java.util.Locale;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class DataSeeder implements CommandLineRunner {

    private static final String SUPER_ADMIN_EMAIL = "super@colony.com";
    private static final String SISTEMAS = "SISTEMAS";

    private final UsuarioRepository usuarioRepository;
    private final DepartamentoRepository departamentoRepository;
    private final PasswordEncoder passwordEncoder;

    @Override
    public void run(String... args) {
        String departamentoId = asegurarDepartamentoSistemas();
        Usuario existing = usuarioRepository.findByEmail(SUPER_ADMIN_EMAIL).orElse(null);

        if (existing != null) {
            // Mantiene siempre una cuenta raiz utilizable para administracion inicial.
            existing.setRol("SUPER_ADMIN");
            existing.setDepartamentoId(departamentoId);
            if (existing.getActivo() == null) {
                existing.setActivo(Boolean.TRUE);
            }
            usuarioRepository.save(existing);
            return;
        }

        Usuario superAdmin = new Usuario();
        superAdmin.setNombres("Super");
        superAdmin.setApellidos("Admin");
        superAdmin.setEmail(SUPER_ADMIN_EMAIL.toLowerCase(Locale.ROOT));
        superAdmin.setPassword(passwordEncoder.encode("admin123"));
        superAdmin.setRol("SUPER_ADMIN");
        superAdmin.setDepartamentoId(departamentoId);
        superAdmin.setActivo(Boolean.TRUE);

        usuarioRepository.save(superAdmin);
    }

    private String asegurarDepartamentoSistemas() {
        Departamento existente = departamentoRepository.findByNombreIgnoreCase(SISTEMAS).orElse(null);
        if (existente != null) {
            return existente.getId();
        }

        Departamento sistemas = new Departamento();
        sistemas.setNombre(SISTEMAS);
        sistemas.setActivo("ACTIVO");
        return departamentoRepository.save(sistemas).getId();
    }
}
