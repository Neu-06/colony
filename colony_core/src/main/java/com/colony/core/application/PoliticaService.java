package com.colony.core.application;

import com.colony.core.application.dto.PoliticaPublicadaResumenDto;
import com.colony.core.domain.PoliticaNegocio;
import com.colony.core.domain.Usuario;
import com.colony.core.infrastructure.repository.PoliticaNegocioRepository;
import com.colony.core.infrastructure.repository.UsuarioRepository;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
@RequiredArgsConstructor
public class PoliticaService {

    private final PoliticaNegocioRepository politicaNegocioRepository;
    private final UsuarioRepository usuarioRepository;

    public PoliticaNegocio guardarPolitica(PoliticaNegocio politica) {
        String usuarioId = resolveAuthenticatedUserId();

        // Siempre fija el creador con el usuario autenticado para evitar suplantaciones en el payload.
        politica.setCreadoPor(usuarioId);

        if (politica.getFechaCreacion() == null) {
            politica.setFechaCreacion(new Date());
        }

        if (politica.getEstado() == null || politica.getEstado().isBlank()) {
            politica.setEstado("BORRADOR");
        } else {
            politica.setEstado(politica.getEstado().trim().toUpperCase(Locale.ROOT));
        }

        if (politica.getVersion() == null) {
            politica.setVersion(1);
        }

        return politicaNegocioRepository.save(politica);
    }

    public List<PoliticaNegocio> listarMisBorradores() {
        String usuarioId = resolveAuthenticatedUserId();
        return politicaNegocioRepository.findByCreadoPorAndEstadoOrderByFechaCreacionDesc(usuarioId, "BORRADOR");
    }

    public List<PoliticaPublicadaResumenDto> listarPublicadas() {
        List<PoliticaNegocio> publicadas = politicaNegocioRepository.findByEstadoOrderByFechaCreacionDesc("PUBLICADA");

        List<String> autoresIds = publicadas.stream()
                .map(PoliticaNegocio::getCreadoPor)
                .filter((id) -> id != null && !id.isBlank())
                .distinct()
                .toList();

        Map<String, String> nombresById = new HashMap<>();
        for (Usuario usuario : usuarioRepository.findAllById(autoresIds)) {
            nombresById.put(usuario.getId(), nombreVisibleUsuario(usuario));
        }

        return publicadas.stream().map((politica) -> new PoliticaPublicadaResumenDto(
                politica.getId(),
                politica.getNombre(),
                politica.getVersion(),
                politica.getFechaCreacion(),
                nombresById.getOrDefault(politica.getCreadoPor(), "Admin")
        )).toList();
    }

    public PoliticaNegocio obtenerPoliticaPublicada(String politicaId) {
        PoliticaNegocio politica = politicaNegocioRepository.findById(politicaId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Politica no encontrada"));

        String estado = politica.getEstado() == null ? "" : politica.getEstado().trim().toUpperCase(Locale.ROOT);
        if (!"PUBLICADA".equals(estado)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "La politica solicitada no esta publicada");
        }

        return politica;
    }

    public PoliticaNegocio obtenerPoliticaPropia(String politicaId) {
        String usuarioId = resolveAuthenticatedUserId();

        PoliticaNegocio politica = politicaNegocioRepository.findById(politicaId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Politica no encontrada"));

        if (politica.getCreadoPor() == null || !politica.getCreadoPor().equals(usuarioId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No tienes acceso a esta politica");
        }

        return politica;
    }

    public void eliminarPoliticaPropia(String politicaId) {
        String usuarioId = resolveAuthenticatedUserId();

        PoliticaNegocio politica = politicaNegocioRepository.findById(politicaId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Politica no encontrada"));

        if (politica.getCreadoPor() == null || !politica.getCreadoPor().equals(usuarioId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No tienes acceso a esta politica");
        }

        politicaNegocioRepository.deleteById(politicaId);
    }

    private String nombreVisibleUsuario(Usuario usuario) {
        String nombres = usuario.getNombres() == null ? "" : usuario.getNombres().trim();
        String apellidos = usuario.getApellidos() == null ? "" : usuario.getApellidos().trim();
        String fullName = (nombres + " " + apellidos).trim();

        if (!fullName.isBlank()) {
            return fullName;
        }

        return usuario.getEmail() == null || usuario.getEmail().isBlank() ? "Admin" : usuario.getEmail();
    }

    private String resolveAuthenticatedUserId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();

        if (authentication == null || !authentication.isAuthenticated()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "No autenticado");
        }

        Object principal = authentication.getPrincipal();
        if (principal instanceof Usuario usuario && usuario.getId() != null && !usuario.getId().isBlank()) {
            return usuario.getId();
        }

        throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "No se pudo resolver el usuario autenticado");
    }
}
