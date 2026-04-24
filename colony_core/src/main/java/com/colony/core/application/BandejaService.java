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
        List<Instancia> instancias = instanciaRepository.findByEstadoGeneral(EN_PROCESO);
        Map<String, PoliticaNegocio> politicaCache = new HashMap<>();
        List<BandejaItemDto> resultado = new ArrayList<>();

        for (Instancia instancia : instancias) {
            if (!perteneceADepartamento(instancia, departamentoId, politicaCache)) {
                continue;
            }

            String semaforo = instancia.getAtendidoPor() == null || instancia.getAtendidoPor().isBlank()
                    ? "ROJO"
                    : "AMARILLO";

            resultado.add(new BandejaItemDto(
                    instancia.getId(),
                    instancia.getCodigo(),
                    instancia.getFechaInicio(),
                    semaforo
            ));
        }

        return resultado;
    }

    public void tomarTramite(String instanciaId, String usuarioId) {
        Instancia instancia = instanciaRepository.findById(instanciaId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Instancia no encontrada"));

        instancia.setAtendidoPor(usuarioId);
        instanciaRepository.save(instancia);
    }

    private boolean perteneceADepartamento(
            Instancia instancia,
            String departamentoId,
            Map<String, PoliticaNegocio> politicaCache
    ) {
        String politicaId = instancia.getPoliticaId();
        String nodoActualId = resolverNodoActualId(instancia);

        if (politicaId == null || politicaId.isBlank() || nodoActualId == null || nodoActualId.isBlank()) {
            return false;
        }

        PoliticaNegocio politica = politicaCache.computeIfAbsent(
                politicaId,
                (id) -> politicaNegocioRepository.findById(id).orElse(null)
        );

        if (politica == null || politica.getNodos() == null || politica.getCarriles() == null) {
            return false;
        }

        NodoBase nodoActual = politica.getNodos().stream()
                .filter((nodo) -> nodoActualId.equals(nodo.getIdNodo()))
                .findFirst()
                .orElse(null);

        if (nodoActual == null || nodoActual.getCarrilId() == null) {
            return false;
        }

        Carril carril = politica.getCarriles().stream()
                .filter((item) -> nodoActual.getCarrilId().equals(item.getId()))
                .findFirst()
                .orElse(null);

        return carril != null && departamentoId.equals(carril.getDepartamentoId());
    }

    private String resolverNodoActualId(Instancia instancia) {
        if (instancia.getNodoActualId() != null && !instancia.getNodoActualId().isBlank()) {
            return instancia.getNodoActualId();
        }

        return instancia.getNodoActual();
    }
}
