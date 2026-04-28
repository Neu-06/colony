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
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Slf4j
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
    private final SimpMessagingTemplate messagingTemplate;

    public IniciarInstanciaResponse iniciar(IniciarInstanciaRequest request) {
        PoliticaNegocio politica = politicaNegocioRepository.findById(request.politicaId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Politica no encontrada"));

        NodoBase nodoInicio = tramiteService.buscarNodoInicio(politica);
        Arista aristaInicio = tramiteService.buscarAristaSalida(politica, nodoInicio.getIdNodo());
        NodoBase primeraTarea = tramiteService.buscarNodoPorId(politica, aristaInicio.getDestinoNodoId());

        Arista aristaPrimeraTarea = tramiteService.buscarAristaSalida(politica, primeraTarea.getIdNodo());
        String segundoNodoId = aristaPrimeraTarea.getDestinoNodoId();

        if (segundoNodoId == null || segundoNodoId.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "La primera tarea no tiene un nodo destino valido");
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

    public AtencionTramiteDto obtenerAtencion(String instanciaId, String tareaId) {
        Instancia instancia = instanciaRepository.findById(instanciaId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Instancia no encontrada"));

        PoliticaNegocio politica = politicaNegocioRepository.findById(instancia.getPoliticaId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Politica no encontrada"));

        // Si se provee tareaId, verificamos que esté en los nodos actuales de la
        // instancia
        String nodoActualId = (tareaId != null && instancia.getNodosActualesIds().contains(tareaId))
                ? tareaId
                : (instancia.getNodosActualesIds().isEmpty() ? null : instancia.getNodosActualesIds().get(0));

        List<com.colony.core.domain.CampoForm> esquema = new ArrayList<>();
        if (nodoActualId != null) {
            NodoBase nodoActual = politica.getNodos().stream().filter(n -> n.getIdNodo().equals(nodoActualId))
                    .findFirst().orElse(null);
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
                esquema);
    }

    public Instancia avanzar(AvanzarInstanciaRequest request) {
        log.info("Iniciando avance de instanciaId: {}", request.instanciaId());
        try {
            Instancia instancia = instanciaRepository.findById(request.instanciaId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Instancia no encontrada"));

            PoliticaNegocio politica = politicaNegocioRepository.findById(instancia.getPoliticaId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Politica no encontrada"));

            Map<String, Object> acumulado = instancia.getDatosDinamicos() == null
                    ? new HashMap<>()
                    : new HashMap<>(instancia.getDatosDinamicos());

            if (request.datosNuevos() != null) {
                acumulado.putAll(request.datosNuevos());
            }

            instancia.setDatosDinamicos(acumulado);

            if (instancia.getNodosActualesIds() == null || instancia.getNodosActualesIds().isEmpty()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La instancia no tiene nodos activos");
            }

            String nodoActualId = (request.nodoId() != null && instancia.getNodosActualesIds().contains(request.nodoId()))
                    ? request.nodoId()
                    : instancia.getNodosActualesIds().get(0);
            
            // Si el usuario envió un nodoId que no es parte de los activos de la instancia, error
            if (request.nodoId() != null && !instancia.getNodosActualesIds().contains(request.nodoId())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La tarea " + request.nodoId() + " no está activa o ya fue procesada.");
            }
            log.info("Nodo actual evaluado: {}", nodoActualId);

            NodoBase nodoActual = politica.getNodos().stream()
                    .filter(n -> n.getIdNodo().equals(nodoActualId)).findFirst()
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nodo actual invalido"));

            Historial historialAbierto = historialRepository
                    .findFirstByInstanciaIDAndNodoDestinoAndFechaFinAtencionIsNullOrderByFechaIngresoDesc(
                            request.instanciaId(), nodoActualId);
            if (historialAbierto != null) {
                historialAbierto.setFechaFinAtencion(new Date());
                historialAbierto.setEjecutadoPor(request.usuarioId());
                historialAbierto.setAccionTomada("AVANZAR");
                if (historialAbierto.getFechaInicioAtencion() != null) {
                    long diffInMillies = Math.abs(historialAbierto.getFechaFinAtencion().getTime()
                            - historialAbierto.getFechaInicioAtencion().getTime());
                    historialAbierto.setTiempoResolucionSegundos(diffInMillies / 1000);
                }
                historialRepository.save(historialAbierto);
                log.info("Historial cerrado para nodo: {}", nodoActualId);
            }

            List<Arista> aristasSalida = politica.getAristas().stream()
                    .filter(a -> a.getOrigenNodoId().equals(nodoActualId)).toList();

            if (aristasSalida.isEmpty() && !esNodoFin(nodoActual)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No se encontró ruta válida para avanzar");
            }

            instancia.getNodosActualesIds().remove(nodoActualId);
            instancia.setAtendidoPor(null);
            log.info("Regla de limpieza aplicada: atendidoPor = null");

            List<String> siguientesNodosIds = new ArrayList<>();
            if (nodoActual instanceof com.colony.core.domain.NodoCompuerta compuerta) {
                String decisionKey = compuerta.getCondicionLogica();
                Object valorObj = acumulado.get(decisionKey);
                String valorStr = valorObj != null ? String.valueOf(valorObj) : "";
                Arista aristaCoincidente = aristasSalida.stream()
                        .filter(a -> valorStr.equalsIgnoreCase(a.getCondicion()))
                        .findFirst()
                        .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST,
                                "Condición no mapeada en el diagrama: " + valorStr));
                siguientesNodosIds.add(aristaCoincidente.getDestinoNodoId());
            } else if ("fork".equalsIgnoreCase(nodoActual.getTipo())) {
                aristasSalida.forEach(a -> siguientesNodosIds.add(a.getDestinoNodoId()));
            } else if (!aristasSalida.isEmpty()) {
                siguientesNodosIds.add(aristasSalida.get(0).getDestinoNodoId());
            }

            List<String> colaProcesamiento = new ArrayList<>(siguientesNodosIds);
            while (!colaProcesamiento.isEmpty()) {
                String sigId = colaProcesamiento.remove(0);
                NodoBase sigNodo = politica.getNodos().stream().filter(n -> n.getIdNodo().equals(sigId)).findFirst()
                        .orElse(null);

                if (sigId == null || sigNodo == null)
                    continue;

                // 1. AUTO-AVANCE: Si es un nodo de control, procesar y encolar sus salidas
                String tipoSig = sigNodo.getTipo() == null ? "" : sigNodo.getTipo().toLowerCase(Locale.ROOT);

                if ("fork".equalsIgnoreCase(tipoSig)) {
                    log.info("Auto-avance FORK detectado: {}", sigId);
                    politica.getAristas().stream()
                            .filter(a -> a.getOrigenNodoId().equals(sigId))
                            .forEach(a -> colaProcesamiento.add(a.getDestinoNodoId()));
                    continue;
                }

                if ("join".equalsIgnoreCase(tipoSig)) {
                    long aristasEntrada = politica.getAristas().stream().filter(a -> a.getDestinoNodoId().equals(sigId))
                            .count();
                    long llegadasAlJoin = historialRepository
                            .findByInstanciaIDOrderByFechaTransicionAsc(instancia.getId())
                            .stream().filter(h -> h.getNodoDestino().equals(sigId)).count();

                    if (llegadasAlJoin + 1 < aristasEntrada) {
                        log.info("JOIN esperando ramas: {}/{}", llegadasAlJoin + 1, aristasEntrada);
                        Historial hSync = new Historial();
                        hSync.setInstanciaID(instancia.getId());
                        hSync.setNodoOrigen(nodoActualId);
                        hSync.setNodoDestino(sigId);
                        hSync.setFechaIngreso(new Date());
                        hSync.setAccionTomada("SYNC_WAIT");
                        historialRepository.save(hSync);
                        continue;
                    }
                    log.info("JOIN completo: avanzando salidas");
                    politica.getAristas().stream()
                            .filter(a -> a.getOrigenNodoId().equals(sigId))
                            .forEach(a -> colaProcesamiento.add(a.getDestinoNodoId()));
                    continue;
                }

                if (sigNodo instanceof com.colony.core.domain.NodoCompuerta compuertaSig) {
                    log.info("Auto-avance DECISION detectado: {}", sigId);
                    String decisionKey = compuertaSig.getCondicionLogica();
                    Object valorObj = acumulado.get(decisionKey);
                    String valorStr = valorObj != null ? String.valueOf(valorObj) : "";

                    Arista coincidente = politica.getAristas().stream()
                            .filter(a -> a.getOrigenNodoId().equals(sigId))
                            .filter(a -> valorStr.equalsIgnoreCase(a.getCondicion()))
                            .findFirst().orElse(null);

                    if (coincidente != null) {
                        colaProcesamiento.add(coincidente.getDestinoNodoId());
                    }
                    continue;
                }

                // 2. ATERRIZAJE: Si es Tarea o Fin
                if (!esNodoFin(sigNodo)) {
                    instancia.getNodosActualesIds().add(sigId);
                    Historial nuevoHist = new Historial();
                    nuevoHist.setInstanciaID(instancia.getId());
                    nuevoHist.setNodoOrigen(nodoActualId);
                    nuevoHist.setNodoDestino(sigId);
                    nuevoHist.setFechaIngreso(new Date());
                    historialRepository.save(nuevoHist);
                    log.info("Token aterrizado en tarea: {}", sigId);
                } else {
                    log.info("Token aterrizado en FIN: {}", sigId);
                    // Registrar fin en el historial para el Join si fuera necesario
                    Historial hFin = new Historial();
                    hFin.setInstanciaID(instancia.getId());
                    hFin.setNodoOrigen(nodoActualId);
                    hFin.setNodoDestino(sigId);
                    hFin.setFechaIngreso(new Date());
                    hFin.setAccionTomada("FIN");
                    historialRepository.save(hFin);
                }
            }

            if (instancia.getNodosActualesIds().isEmpty()) {
                instancia.setEstadoGeneral(FINALIZADO);
                instancia.setSemaforo("VERDE");
                instancia.setFechaFin(new Date());
                log.info("Instancia finalizada automáticamente");
            } else {
                instancia.setEstadoGeneral(EN_PROCESO);
                instancia.setSemaforo("AMARILLO");
            }

            Instancia guardada = instanciaRepository.save(instancia);
            log.info("Avance de instancia guardado con éxito. Estado: {}", guardada.getEstadoGeneral());

            // BROADCAST WebSocket al dashboard de monitoreo
            try {
                // Enriquecer nombres de tareas para el dashboard
                List<String> tareasNombres = new ArrayList<>();
                if (politica != null && guardada.getNodosActualesIds() != null) {
                    for (String nodoId : guardada.getNodosActualesIds()) {
                        NodoBase nodo = politica.getNodos().stream()
                            .filter(n -> n.getIdNodo().equals(nodoId)).findFirst().orElse(null);
                        if (nodo != null) {
                            String nombreDepto = "Sin Carril";
                            if (nodo.getCarrilId() != null && politica.getCarriles() != null) {
                                nombreDepto = politica.getCarriles().stream()
                                    .filter(c -> c.getId().equals(nodo.getCarrilId()))
                                    .map(com.colony.core.domain.Carril::getNombre)
                                    .findFirst().orElse("Sin Carril");
                            }
                            tareasNombres.add(nodo.getNombre() + " (" + nombreDepto + ")");
                        }
                    }
                }

                Map<String, Object> broadcast = new HashMap<>();
                broadcast.put("instanciaId", guardada.getId());
                broadcast.put("codigo", guardada.getCodigo());
                broadcast.put("politicaId", guardada.getPoliticaId());
                broadcast.put("estadoGeneral", guardada.getEstadoGeneral());
                broadcast.put("semaforo", calcularSemaforo(guardada));
                broadcast.put("nodosActualesIds", guardada.getNodosActualesIds());
                broadcast.put("tareasActualesNombres", tareasNombres);
                messagingTemplate.convertAndSend("/topic/monitoreo", broadcast);
                log.info("Broadcast de monitoreo enviado para instancia: {}", guardada.getCodigo());
            } catch (Exception e) {
                log.warn("Falló el broadcast de monitoreo (no crítico): {}", e.getMessage());
            }

            // --- Notificaciones Push ---
            if (guardada.getDispositivosSuscritos() != null && !guardada.getDispositivosSuscritos().isEmpty()) {
                try {
                    log.info("Enviando notificación Push a " + guardada.getDispositivosSuscritos().size() + " dispositivos...");
                    pushNotificationService.enviarNotificacion(
                            guardada.getDispositivosSuscritos(),
                            "Trámite Actualizado",
                            "El trámite ha avanzado a una nueva tarea."
                    );
                } catch (Exception e) {
                    log.error("Error al enviar notificación Push: {}", e.getMessage(), e);
                }
            }

            return guardada;

        } catch (NullPointerException e) {
            log.error("NullPointerException al avanzar la instancia", e);
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No se encontró ruta válida para avanzar");
        } catch (ResponseStatusException e) {
            log.error("ResponseStatusException al avanzar instancia: {}", e.getReason());
            throw e;
        } catch (Exception e) {
            log.error("Error al avanzar instancia", e);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Error interno del motor");
        }
    }

    private boolean esNodoFin(NodoBase nodo) {
        String tipo = nodo.getTipo() == null ? "" : nodo.getTipo().trim().toLowerCase(Locale.ROOT);
        return "fin".equals(tipo) || "end".equals(tipo);
    }

    private String calcularSemaforo(Instancia inst) {
        if ("FINALIZADO".equalsIgnoreCase(inst.getEstadoGeneral())) {
            return "VERDE";
        }

        Historial ultima = historialRepository.findFirstByInstanciaIDOrderByFechaTransicionDesc(inst.getId());
        Date referencia = (ultima != null && ultima.getFechaTransicion() != null) 
            ? ultima.getFechaTransicion() 
            : inst.getFechaInicio();

        if (referencia == null) return "AMARILLO";

        long diff = new Date().getTime() - referencia.getTime();
        long horas = diff / (1000 * 60 * 60);

        return horas > 24 ? "ROJO" : "AMARILLO";
    }

    private String generarCodigoRastreo() {
        return "TRM-" + UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase(Locale.ROOT);
    }
}
