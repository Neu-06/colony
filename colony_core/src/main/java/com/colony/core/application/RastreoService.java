package com.colony.core.application;

import com.colony.core.application.dto.RastreoResponseDto;
import com.colony.core.domain.Instancia;
import com.colony.core.domain.PoliticaNegocio;
import com.colony.core.infrastructure.repository.HistorialRepository;
import com.colony.core.infrastructure.repository.InstanciaRepository;
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
public class RastreoService {

    private final InstanciaRepository instanciaRepository;
    private final PoliticaNegocioRepository politicaNegocioRepository;
    private final HistorialRepository historialRepository;

    public RastreoResponseDto rastrearPorCodigo(String codigo) {
        Instancia instancia = instanciaRepository.findByCodigo(codigo)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Tramite no encontrado"));

        PoliticaNegocio politica = politicaNegocioRepository.findById(instancia.getPoliticaId()).orElse(null);
        String nombrePolitica = politica != null ? politica.getNombre() : "Trámite";

        // Cache de nombres de nodos para optimizar el timeline
        java.util.Map<String, String> nombresNodos = new java.util.HashMap<>();
        if (politica != null && politica.getNodos() != null) {
            politica.getNodos().forEach(n -> nombresNodos.put(n.getIdNodo(), n.getNombre()));
        }

        String nodoActualId = instancia.getNodosActualesIds().isEmpty() ? "" : instancia.getNodosActualesIds().get(0);
        String nombreNodoActual = nombresNodos.getOrDefault(nodoActualId, "Finalizado");

        List<String> timeline = historialRepository.findByInstanciaIDOrderByFechaTransicionAsc(instancia.getId())
                .stream()
                .map((item) -> {
                    String nombreNodo = nombresNodos.getOrDefault(item.getNodoDestino(), "Nodo");
                    String accionRaw = item.getAccionTomada();

                    String etiqueta = switch (accionRaw != null ? accionRaw : "") {
                        case "INICIO_TRAMITE" -> "Trámite iniciado en";
                        case "AVANZAR" -> "Tarea completada, pasa a";
                        case "SYNC_WAIT" -> "En espera de otras ramas en";
                        case "FIN" -> "Flujo finalizado en";
                        default -> "Llegada a";
                    };

                    return etiqueta + " " + nombreNodo;
                })
                .toList();

        return new RastreoResponseDto(
                instancia.getCodigo(),
                nombrePolitica,
                mapearEstado(instancia.getEstadoGeneral()),
                nodoActualId,
                nombreNodoActual,
                instancia.getFechaInicio(),
                timeline);
    }

    public void suscribirDispositivo(String codigo, String token) {
        Instancia instancia = instanciaRepository.findByCodigo(codigo)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Tramite no encontrado"));

        if (instancia.getDispositivosSuscritos() == null) {
            instancia.setDispositivosSuscritos(new ArrayList<>());
        }

        if (!instancia.getDispositivosSuscritos().contains(token)) {
            instancia.getDispositivosSuscritos().add(token);
            instanciaRepository.save(instancia);
        }
    }

    private String mapearEstado(String estadoGeneral) {
        String estado = estadoGeneral == null ? "" : estadoGeneral.trim().toUpperCase(Locale.ROOT);

        return switch (estado) {
            case "FINALIZADO" -> "VERDE";
            case "EN_PROCESO" -> "AMARILLO";
            default -> "ROJO";
        };
    }
}
