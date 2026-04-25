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
    private final PushNotificationService pushNotificationService;

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
        instancia.getNodosActualesIds().add(segundoNodoId);
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
        historial.setFechaIngreso(new Date());
        historialRepository.save(historial);

        return new IniciarInstanciaResponse(guardada.getCodigo());
    }

    public AtencionTramiteDto obtenerAtencion(String instanciaId) {
        Instancia instancia = instanciaRepository.findById(instanciaId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Instancia no encontrada"));

        PoliticaNegocio politica = politicaNegocioRepository.findById(instancia.getPoliticaId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Politica no encontrada"));

        // Retornamos el esquema del primer nodo actual como compatibilidad
        String nodoActualId = instancia.getNodosActualesIds().isEmpty() ? null : instancia.getNodosActualesIds().get(0);
        
        List<com.colony.core.domain.CampoForm> esquema = new ArrayList<>();
        if (nodoActualId != null) {
            NodoBase nodoActual = politica.getNodos().stream().filter(n -> n.getIdNodo().equals(nodoActualId)).findFirst().orElse(null);
            if (nodoActual instanceof NodoActividad actividad && actividad.getEsquemaFormulario() != null) {
                esquema = actividad.getEsquemaFormulario();
            }
        }

        Map<String, Object> datos = instancia.getDatosDinamicos() == null
                ? new HashMap<>()
                : new HashMap<>(instancia.getDatosDinamicos());

        return new AtencionTramiteDto(
                instancia.getId(),
                instancia.getCodigo(),
                nodoActualId,
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

        String nodoActualId = request.nodoAvanzarId();
        if (!instancia.getNodosActualesIds().contains(nodoActualId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El nodo no está activo en esta instancia");
        }

        NodoBase nodoActual = politica.getNodos().stream()
                .filter(n -> n.getIdNodo().equals(nodoActualId)).findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nodo actual invalido"));

        // Métricas: Cierre de Historial
        Historial historialAbierto = historialRepository.findFirstByInstanciaIDAndNodoDestinoAndFechaFinAtencionIsNullOrderByFechaIngresoDesc(request.instanciaId(), nodoActualId);
        if (historialAbierto != null) {
            historialAbierto.setFechaFinAtencion(new Date());
            historialAbierto.setEjecutadoPor(request.usuarioId());
            historialAbierto.setAccionTomada("AVANZAR");
            if (historialAbierto.getFechaInicioAtencion() != null) {
                long diffInMillies = Math.abs(historialAbierto.getFechaFinAtencion().getTime() - historialAbierto.getFechaInicioAtencion().getTime());
                historialAbierto.setTiempoResolucionSegundos(diffInMillies / 1000);
            }
            historialRepository.save(historialAbierto);
        }

        List<Arista> aristasSalida = politica.getAristas().stream()
                .filter(a -> a.getOrigenNodoId().equals(nodoActualId)).toList();

        instancia.getNodosActualesIds().remove(nodoActualId);
        instancia.setAtendidoPor(null);

        List<String> siguientesNodosIds = new ArrayList<>();

        if (nodoActual instanceof com.colony.core.domain.NodoCompuerta compuerta) {
            String decisionKey = compuerta.getCondicionLogica();
            if (decisionKey != null && !decisionKey.isBlank()) {
                // CONDICIONAL (XOR)
                Object valorObj = acumulado.get(decisionKey);
                String valorStr = valorObj != null ? String.valueOf(valorObj) : "";

                Arista aristaCoincidente = aristasSalida.stream()
                        .filter(a -> valorStr.equalsIgnoreCase(a.getCondicion()))
                        .findFirst()
                        .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "No se encontró arista para la condición: " + valorStr));
                
                siguientesNodosIds.add(aristaCoincidente.getDestinoNodoId());
            } else {
                // PARALELO (AND)
                aristasSalida.forEach(a -> siguientesNodosIds.add(a.getDestinoNodoId()));
            }
        } else {
            // LINEAL / BUCLE
            if (!aristasSalida.isEmpty()) {
                siguientesNodosIds.add(aristasSalida.get(0).getDestinoNodoId());
            }
        }

        for (String sigId : siguientesNodosIds) {
            NodoBase sigNodo = politica.getNodos().stream().filter(n -> n.getIdNodo().equals(sigId)).findFirst().orElse(null);
            if (sigNodo == null) continue;

            if (!esNodoFin(sigNodo)) {
                instancia.getNodosActualesIds().add(sigId);

                Historial nuevoHist = new Historial();
                nuevoHist.setInstanciaID(instancia.getId());
                nuevoHist.setNodoOrigen(nodoActualId);
                nuevoHist.setNodoDestino(sigId);
                nuevoHist.setFechaIngreso(new Date());
                historialRepository.save(nuevoHist);
            }
        }

        if (instancia.getNodosActualesIds().isEmpty()) {
            instancia.setEstadoGeneral(FINALIZADO);
            instancia.setFechaFin(new Date());
        } else {
            instancia.setEstadoGeneral(EN_PROCESO);
        }

        Instancia guardada = instanciaRepository.save(instancia);

        // Disparar Notificación Push
        if (guardada.getDispositivosSuscritos() != null && !guardada.getDispositivosSuscritos().isEmpty()) {
            String cuerpo = String.format("Colony: Tu trámite ha sido actualizado. Estado actual: %s",
                    FINALIZADO.equals(guardada.getEstadoGeneral()) ? "FINALIZADO" : "EN PROCESO");
            pushNotificationService.enviarNotificacion(
                    guardada.getDispositivosSuscritos(),
                    "Actualización de Trámite",
                    cuerpo
            );
        }

        return guardada;
    }

    private boolean esNodoFin(NodoBase nodo) {
        String tipo = nodo.getTipo() == null ? "" : nodo.getTipo().trim().toLowerCase(Locale.ROOT);
        return "fin".equals(tipo) || "end".equals(tipo);
    }

    private String generarCodigoRastreo() {
        return "TRM-" + UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase(Locale.ROOT);
    }
}
