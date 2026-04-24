package com.colony.core.application;

import com.colony.core.application.dto.AtencionTramiteDto;
import com.colony.core.application.dto.AvanzarInstanciaRequest;
import com.colony.core.application.dto.IniciarInstanciaRequest;
import com.colony.core.application.dto.IniciarInstanciaResponse;
import com.colony.core.domain.Arista;
import com.colony.core.domain.Historial;
import com.colony.core.domain.Instancia;
import com.colony.core.domain.NodoActividad;
import com.colony.core.domain.NodoBase;
import com.colony.core.domain.PoliticaNegocio;
import com.colony.core.infrastructure.repository.HistorialRepository;
import com.colony.core.infrastructure.repository.InstanciaRepository;
import com.colony.core.infrastructure.repository.PoliticaNegocioRepository;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
@RequiredArgsConstructor
public class MotorInstanciaService {

    private static final String EN_PROCESO = "EN_PROCESO";
    private static final String FINALIZADO = "FINALIZADO";

    private final InstanciaRepository instanciaRepository;
    private final PoliticaNegocioRepository politicaNegocioRepository;
    private final HistorialRepository historialRepository;
    private final TramiteService tramiteService;

    public IniciarInstanciaResponse iniciar(IniciarInstanciaRequest request) {
        PoliticaNegocio politica = politicaNegocioRepository.findById(request.politicaId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Politica no encontrada"));

        NodoBase nodoInicio = tramiteService.buscarNodoInicio(politica);
        Arista aristaInicio = tramiteService.buscarAristaSalida(politica, nodoInicio.getIdNodo());
        NodoBase primeraTarea = tramiteService.buscarNodoPorId(politica, aristaInicio.getDestinoNodoId());

        Arista aristaPrimeraTarea = tramiteService.buscarAristaSalida(politica, primeraTarea.getIdNodo());
        String segundoNodoId = aristaPrimeraTarea.getDestinoNodoId();

        if (segundoNodoId == null || segundoNodoId.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La primera tarea no tiene un nodo destino valido");
        }

        Instancia instancia = new Instancia();
        instancia.setCodigo(generarCodigoRastreo());
        instancia.setPoliticaId(politica.getId());
        instancia.setIniciadoPor(request.usuarioIniciadorId());
        instancia.setEstadoGeneral(EN_PROCESO);
        instancia.setAtendidoPor(null);
        instancia.setNodoActualId(segundoNodoId);
        instancia.setNodoActual(segundoNodoId);
        instancia.setSemaforo("ROJO");
        instancia.setFechaInicio(new Date());

        Map<String, Object> datosIniciales = request.datosIniciales() == null
                ? new HashMap<>()
                : new HashMap<>(request.datosIniciales());
        instancia.setDatosDinamicos(datosIniciales);

        Instancia guardada = instanciaRepository.save(instancia);

        Historial historial = new Historial();
        historial.setInstanciaID(guardada.getId());
        historial.setNodoOrigen(nodoInicio.getIdNodo());
        historial.setNodoDestino(segundoNodoId);
        historial.setEjecutadoPor(request.usuarioIniciadorId());
        historial.setAccionTomada("INICIO_TRAMITE");
        historial.setFechaTransicion(new Date());
        historialRepository.save(historial);

        return new IniciarInstanciaResponse(guardada.getCodigo());
    }

    public AtencionTramiteDto obtenerAtencion(String instanciaId) {
        Instancia instancia = instanciaRepository.findById(instanciaId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Instancia no encontrada"));

        PoliticaNegocio politica = politicaNegocioRepository.findById(instancia.getPoliticaId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Politica no encontrada"));

        NodoBase nodoActual = resolverNodoActual(instancia, politica);
        List<com.colony.core.domain.CampoForm> esquema = new ArrayList<>();
        if (nodoActual instanceof NodoActividad actividad && actividad.getEsquemaFormulario() != null) {
            esquema = actividad.getEsquemaFormulario();
        }

        Map<String, Object> datos = instancia.getDatosDinamicos() == null
                ? new HashMap<>()
                : new HashMap<>(instancia.getDatosDinamicos());

        return new AtencionTramiteDto(
                instancia.getId(),
                instancia.getCodigo(),
                resolverNodoActualId(instancia),
                datos,
                esquema
        );
    }

    public Instancia avanzar(AvanzarInstanciaRequest request) {
        Instancia instancia = instanciaRepository.findById(request.instanciaId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Instancia no encontrada"));

        PoliticaNegocio politica = politicaNegocioRepository.findById(instancia.getPoliticaId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Politica no encontrada"));

        Map<String, Object> acumulado = instancia.getDatosDinamicos() == null
                ? new HashMap<>()
                : new HashMap<>(instancia.getDatosDinamicos());

        if (request.datos() != null) {
            acumulado.putAll(request.datos());
        }

        instancia.setDatosDinamicos(acumulado);

        String nodoActualId = resolverNodoActualId(instancia);
        Arista aristaSalida = politica.getAristas() == null
                ? null
                : politica.getAristas().stream()
                        .filter((arista) -> nodoActualId.equals(arista.getOrigenNodoId()))
                        .findFirst()
                        .orElse(null);

        if (aristaSalida == null || aristaSalida.getDestinoNodoId() == null || aristaSalida.getDestinoNodoId().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No existe transicion valida desde el nodo actual");
        }

        String siguienteNodoId = aristaSalida.getDestinoNodoId();
        NodoBase siguienteNodo = politica.getNodos() == null
                ? null
                : politica.getNodos().stream()
                        .filter((nodo) -> siguienteNodoId.equals(nodo.getIdNodo()))
                        .findFirst()
                        .orElse(null);

        if (siguienteNodo == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El nodo destino no existe en la politica");
        }

        instancia.setNodoActualId(siguienteNodoId);
        instancia.setNodoActual(siguienteNodoId);
        instancia.setAtendidoPor(null);

        if (esNodoFin(siguienteNodo)) {
            instancia.setEstadoGeneral(FINALIZADO);
            instancia.setFechaFin(new Date());
        } else {
            instancia.setEstadoGeneral(EN_PROCESO);
        }

        return instanciaRepository.save(instancia);
    }

    private NodoBase resolverNodoActual(Instancia instancia, PoliticaNegocio politica) {
        String nodoActualId = resolverNodoActualId(instancia);

        if (politica.getNodos() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La politica no contiene nodos");
        }

        return politica.getNodos().stream()
                .filter((nodo) -> nodoActualId.equals(nodo.getIdNodo()))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nodo actual invalido para la instancia"));
    }

    private String resolverNodoActualId(Instancia instancia) {
        if (instancia.getNodoActualId() != null && !instancia.getNodoActualId().isBlank()) {
            return instancia.getNodoActualId();
        }

        if (instancia.getNodoActual() != null && !instancia.getNodoActual().isBlank()) {
            return instancia.getNodoActual();
        }

        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La instancia no tiene nodo actual");
    }

    private boolean esNodoFin(NodoBase nodo) {
        String tipo = nodo.getTipo() == null ? "" : nodo.getTipo().trim().toLowerCase(Locale.ROOT);
        return "fin".equals(tipo) || "end".equals(tipo);
    }

    private String generarCodigoRastreo() {
        return "TRM-" + UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase(Locale.ROOT);
    }
}
