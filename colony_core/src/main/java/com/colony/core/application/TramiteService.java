package com.colony.core.application;

import com.colony.core.application.dto.PrimerFormularioDto;
import com.colony.core.application.dto.TramiteCatalogoDto;
import com.colony.core.domain.Arista;
import com.colony.core.domain.NodoActividad;
import com.colony.core.domain.NodoBase;
import com.colony.core.domain.PoliticaNegocio;
import com.colony.core.infrastructure.repository.PoliticaNegocioRepository;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
@RequiredArgsConstructor
public class TramiteService {

    private final PoliticaNegocioRepository politicaNegocioRepository;

    public List<TramiteCatalogoDto> listarPublicados() {
        List<PoliticaNegocio> politicas = politicaNegocioRepository.findByEstadoInOrderByFechaCreacionDesc(
                List.of("PUBLICADO", "PUBLICADA")
        );

        List<TramiteCatalogoDto> resultado = new ArrayList<>();
        for (PoliticaNegocio politica : politicas) {
            resultado.add(new TramiteCatalogoDto(
                    politica.getId(),
                    politica.getNombre(),
                    descripcionPolitica(politica)
            ));
        }

        return resultado;
    }

    public PrimerFormularioDto obtenerPrimerFormulario(String politicaId) {
        PoliticaNegocio politica = politicaNegocioRepository.findById(politicaId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Politica no encontrada"));

        NodoBase nodoInicio = buscarNodoInicio(politica);
        Arista salidaInicio = buscarAristaSalida(politica, nodoInicio.getIdNodo());
        NodoBase primeraTarea = buscarNodoPorId(politica, salidaInicio.getDestinoNodoId());

        if (!(primeraTarea instanceof NodoActividad actividad)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El nodo posterior al inicio no es una tarea valida");
        }

        return new PrimerFormularioDto(
                politicaId,
                actividad.getIdNodo(),
                actividad.getEsquemaFormulario() == null ? List.of() : actividad.getEsquemaFormulario()
        );
    }

    public NodoBase buscarNodoInicio(PoliticaNegocio politica) {
        if (politica.getNodos() == null || politica.getNodos().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La politica no contiene nodos");
        }

        return politica.getNodos().stream()
                .filter((nodo) -> {
                    String tipo = nodo.getTipo() == null ? "" : nodo.getTipo().trim().toLowerCase(Locale.ROOT);
                    return "inicio".equals(tipo) || "start".equals(tipo);
                })
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "No existe nodo de inicio en la politica"));
    }

    public Arista buscarAristaSalida(PoliticaNegocio politica, String origenNodoId) {
        if (politica.getAristas() == null || politica.getAristas().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La politica no contiene aristas");
        }

        return politica.getAristas().stream()
                .filter((arista) -> origenNodoId.equals(arista.getOrigenNodoId()))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "No existe arista de salida para el nodo indicado"));
    }

    public NodoBase buscarNodoPorId(PoliticaNegocio politica, String nodoId) {
        if (nodoId == null || nodoId.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nodo destino invalido");
        }

        if (politica.getNodos() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La politica no contiene nodos");
        }

        return politica.getNodos().stream()
                .filter((nodo) -> nodoId.equals(nodo.getIdNodo()))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nodo no encontrado en la politica"));
    }

    private String descripcionPolitica(PoliticaNegocio politica) {
        if (politica.getNombre() == null || politica.getNombre().isBlank()) {
            return "Tramite publicado";
        }

        return "Flujo publicado: " + politica.getNombre();
    }
}
