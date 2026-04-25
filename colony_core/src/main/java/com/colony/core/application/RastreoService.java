package com.colony.core.application;

import com.colony.core.application.dto.RastreoResponseDto;
import com.colony.core.domain.Carril;
import com.colony.core.domain.Instancia;
import com.colony.core.domain.NodoBase;
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

        String estado = mapearEstado(instancia.getEstadoGeneral());
        String ubicacion = resolverUbicacionActual(instancia);
        List<String> timeline = historialRepository.findByInstanciaIDOrderByFechaTransicionAsc(instancia.getId())
                .stream()
                .map((item) -> item.getAccionTomada() == null || item.getAccionTomada().isBlank()
                        ? "Transicion de nodo"
                        : item.getAccionTomada())
                .toList();

        return new RastreoResponseDto(
                instancia.getCodigo(),
                estado,
                ubicacion,
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

    private String resolverUbicacionActual(Instancia instancia) {
        if (instancia.getPoliticaId() == null || instancia.getPoliticaId().isBlank()) {
            return "Sin departamento asignado";
        }

        PoliticaNegocio politica = politicaNegocioRepository.findById(instancia.getPoliticaId()).orElse(null);
        if (politica == null || politica.getNodos() == null || politica.getCarriles() == null) {
            return "Sin departamento asignado";
        }

        List<String> nodosActualesIds = instancia.getNodosActualesIds();

        if (nodosActualesIds == null || nodosActualesIds.isEmpty()) {
            return "Sin departamento asignado";
        }

        String nodoActualId = nodosActualesIds.get(0);

        NodoBase nodo = politica.getNodos().stream()
                .filter((item) -> nodoActualId.equals(item.getIdNodo()))
                .findFirst()
                .orElse(null);

        if (nodo == null || nodo.getCarrilId() == null) {
            return "Sin departamento asignado";
        }

        Carril carril = politica.getCarriles().stream()
                .filter((item) -> nodo.getCarrilId().equals(item.getId()))
                .findFirst()
                .orElse(null);

        return carril == null || carril.getNombre() == null || carril.getNombre().isBlank()
                ? "Sin departamento asignado"
                : carril.getNombre();
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
