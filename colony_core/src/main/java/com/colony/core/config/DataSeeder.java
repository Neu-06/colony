package com.colony.core.config;

import com.colony.core.domain.Usuario;
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

    private final UsuarioRepository usuarioRepository;
    private final PasswordEncoder passwordEncoder;

    @Override
    public void run(String... args) {
        Usuario existing = usuarioRepository.findByEmail(SUPER_ADMIN_EMAIL).orElse(null);

        if (existing != null) {
            // Mantiene siempre una cuenta raiz utilizable para administracion inicial.
            existing.setRol("SUPER_ADMIN");
            existing.setDepartamento("SISTEMAS");
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
        superAdmin.setDepartamento("SISTEMAS");
        superAdmin.setActivo(Boolean.TRUE);

        usuarioRepository.save(superAdmin);
    }
}
