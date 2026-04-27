package com.colony.core.application;

import com.colony.core.application.dto.BandejaItemDto;
import com.colony.core.domain.Carril;
import com.colony.core.domain.Instancia;
import com.colony.core.domain.NodoBase;
import com.colony.core.domain.PoliticaNegocio;
import com.colony.core.infrastructure.repository.InstanciaRepository;
import com.colony.core.infrastructure.repository.PoliticaNegocioRepository;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
@RequiredArgsConstructor
public class BandejaService {

    private static final String EN_PROCESO = "EN_PROCESO";

    private final InstanciaRepository instanciaRepository;
    private final PoliticaNegocioRepository politicaNegocioRepository;

    public List<BandejaItemDto> listarBandejaPorDepartamento(String departamentoId) {
        List<PoliticaNegocio> politicas = politicaNegocioRepository.findAll();
        List<String> nodosCandidatos = new ArrayList<>();

        for (PoliticaNegocio politica : politicas) {
            if (politica.getCarriles() == null || politica.getNodos() == null)
                continue;

            List<String> carrilesDelDepto = politica.getCarriles().stream()
                    .filter(c -> departamentoId.equals(c.getDepartamentoId()))
                    .map(Carril::getId)
                    .toList();

            if (carrilesDelDepto.isEmpty())
                continue;

            politica.getNodos().stream()
                    .filter(n -> carrilesDelDepto.contains(n.getCarrilId()))
                    .map(NodoBase::getIdNodo)
                    .forEach(nodosCandidatos::add);
        }

        if (nodosCandidatos.isEmpty()) {
            return new ArrayList<>();
        }

        List<Instancia> instancias = instanciaRepository.findByEstadoGeneralAndNodosActualesIdsIn(EN_PROCESO,
                nodosCandidatos);
        Map<String, PoliticaNegocio> politicaCache = new HashMap<>();
        List<BandejaItemDto> resultado = new ArrayList<>();

        for (Instancia instancia : instancias) {
            PoliticaNegocio politica = politicaCache.computeIfAbsent(
                    instancia.getPoliticaId(),
                    (id) -> politicaNegocioRepository.findById(id).orElse(null));

            if (politica == null)
                continue;

            // Identificar el nodo específico que pertenece al departamento del usuario
            List<String> carrilesDelDepto = politica.getCarriles() == null ? List.of()
                    : politica.getCarriles().stream()
                            .filter(c -> departamentoId.equals(c.getDepartamentoId()))
                            .map(Carril::getId)
                            .toList();

            String nodoIdParaDepto = instancia.getNodosActualesIds().stream()
                    .filter(id -> {
                        NodoBase n = politica.getNodos().stream().filter(nodo -> id.equals(nodo.getIdNodo()))
                                .findFirst().orElse(null);
                        return n != null && carrilesDelDepto.contains(n.getCarrilId());
                    })
                    .findFirst().orElse(null);

            if (nodoIdParaDepto == null)
                continue;

            NodoBase nodoActual = politica.getNodos().stream().filter(n -> nodoIdParaDepto.equals(n.getIdNodo()))
                    .findFirst().orElse(null);
            String nombreNodo = nodoActual != null ? nodoActual.getNombre() : "Tarea Pendiente";

            String semaforo = instancia.getAtendidoPor() == null || instancia.getAtendidoPor().isBlank()
                    ? "ROJO"
                    : "AMARILLO";

            resultado.add(new BandejaItemDto(
                    instancia.getId(),
                    instancia.getCodigo(),
                    instancia.getFechaInicio(),
                    semaforo,
                    politica.getNombre() != null ? politica.getNombre() : "Tramite",
                    nombreNodo,
                    nodoIdParaDepto));
        }

        return resultado;
    }

    public void tomarTramite(String instanciaId, String usuarioId) {
        Instancia instancia = instanciaRepository.findById(instanciaId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Instancia no encontrada"));

        instancia.setAtendidoPor(usuarioId);
        instanciaRepository.save(instancia);
    }

}
