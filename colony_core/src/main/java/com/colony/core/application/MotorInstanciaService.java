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

            String nodoActualId = instancia.getNodosActualesIds().get(0);
            log.info("Nodo actual evaluado: {}", nodoActualId);

            NodoBase nodoActual = politica.getNodos().stream()
                    .filter(n -> n.getIdNodo().equals(nodoActualId)).findFirst()
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nodo actual invalido"));

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

            // 1. FLUJO CONDICIONAL (Decisión) & 2. BIFURCACIÓN (Fork)
            if (nodoActual instanceof com.colony.core.domain.NodoCompuerta compuerta) {
                String decisionKey = compuerta.getCondicionLogica();
                Object valorObj = acumulado.get(decisionKey);
                String valorStr = valorObj != null ? String.valueOf(valorObj) : "";
                log.info("Evaluando decisión para '{}' con valor: {}", decisionKey, valorStr);
                
                Arista aristaCoincidente = aristasSalida.stream()
                        .filter(a -> valorStr.equalsIgnoreCase(a.getCondicion()))
                        .findFirst()
                        .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Condición no mapeada en el diagrama: " + valorStr));
                siguientesNodosIds.add(aristaCoincidente.getDestinoNodoId());
            } else if ("fork".equalsIgnoreCase(nodoActual.getTipo())) {
                aristasSalida.forEach(a -> siguientesNodosIds.add(a.getDestinoNodoId()));
                log.info("Bifurcación (FORK): Habilitando {} ramas paralelas", siguientesNodosIds.size());
            } else if (!aristasSalida.isEmpty()) {
                siguientesNodosIds.add(aristasSalida.get(0).getDestinoNodoId());
            }

            // 3. UNIÓN (Join) & 4. PASE DE BATUTA
            for (String sigId : siguientesNodosIds) {
                NodoBase sigNodo = politica.getNodos().stream().filter(n -> n.getIdNodo().equals(sigId)).findFirst().orElse(null);
                if (sigId == null || sigNodo == null) continue;

                // Lógica de Sincronización para JOIN
                if ("join".equalsIgnoreCase(sigNodo.getTipo())) {
                    long aristasEntrada = politica.getAristas().stream().filter(a -> a.getDestinoNodoId().equals(sigId)).count();
                    long llegadasAlJoin = historialRepository.findByInstanciaIDOrderByFechaTransicionAsc(instancia.getId())
                            .stream().filter(h -> h.getNodoDestino().equals(sigId)).count();
                    
                    if (llegadasAlJoin + 1 < aristasEntrada) {
                        log.info("JOIN: Sincronizando ramas ({} de {}) - Token en espera", llegadasAlJoin + 1, aristasEntrada);
                        Historial hSync = new Historial();
                        hSync.setInstanciaID(instancia.getId());
                        hSync.setNodoOrigen(nodoActualId);
                        hSync.setNodoDestino(sigId);
                        hSync.setFechaIngreso(new Date());
                        hSync.setAccionTomada("SYNC_WAIT");
                        historialRepository.save(hSync);
                        continue; // No añadir a nodosActualesIds aún
                    }
                    log.info("JOIN: Sincronización completa. Avanzando flujo principal.");
                }

                if (!esNodoFin(sigNodo)) {
                    instancia.getNodosActualesIds().add(sigId);
                    // Pase de batuta: El motor limpia atendidoPor (L170). Al crear historial nuevo,
                    // el sistema de bandeja lo detectará como disponible para el carrilId del nuevo nodo.
                    Historial nuevoHist = new Historial();
                    nuevoHist.setInstanciaID(instancia.getId());
                    nuevoHist.setNodoOrigen(nodoActualId);
                    nuevoHist.setNodoDestino(sigId);
                    nuevoHist.setFechaIngreso(new Date());
                    historialRepository.save(nuevoHist);
                    log.info("Token movido exitosamente al nodo: {}", sigId);
                } else {
                    log.info("Se alcanzó el nodo FIN: {}", sigId);
                }
            }

            if (instancia.getNodosActualesIds().isEmpty()) {
                instancia.setEstadoGeneral(FINALIZADO);
                instancia.setFechaFin(new Date());
                log.info("Regla de Cierre aplicada: estadoGeneral = FINALIZADO");
            } else {
                instancia.setEstadoGeneral(EN_PROCESO);
            }

            Instancia guardada = instanciaRepository.save(instancia);
            log.info("Avance de instancia guardado con éxito. Estado: {}", guardada.getEstadoGeneral());

            // BROADCAST WebSocket al dashboard de monitoreo
            try {
                String nodoActualBroadcast = (guardada.getNodosActualesIds() == null || guardada.getNodosActualesIds().isEmpty())
                        ? "—" : guardada.getNodosActualesIds().get(0);
                Map<String, Object> broadcast = new HashMap<>();
                broadcast.put("instanciaId", guardada.getId());
                broadcast.put("codigo", guardada.getCodigo());
                broadcast.put("politicaId", guardada.getPoliticaId());
                broadcast.put("estadoGeneral", guardada.getEstadoGeneral());
                broadcast.put("semaforo", guardada.getSemaforo() != null ? guardada.getSemaforo() : "ROJO");
                broadcast.put("nodoActualId", nodoActualBroadcast);
                messagingTemplate.convertAndSend("/topic/monitoreo", broadcast);
                log.info("Broadcast de monitoreo enviado para instancia: {}", guardada.getCodigo());
            } catch (Exception e) {
                log.warn("Falló el broadcast de monitoreo (no crítico): {}", e.getMessage());
            }

            try {
                if (guardada.getDispositivosSuscritos() != null && !guardada.getDispositivosSuscritos().isEmpty()) {
                    String cuerpo = String.format("Colony: Tu trámite ha sido actualizado. Estado actual: %s",
                            FINALIZADO.equals(guardada.getEstadoGeneral()) ? "FINALIZADO" : "EN PROCESO");
                    pushNotificationService.enviarNotificacion(
                            guardada.getDispositivosSuscritos(),
                            "Actualización de Trámite",
                            cuerpo
                    );
                }
            } catch (Exception e) {
                log.warn("El motor avanzó correctamente, pero falló el envío de la notificación: {}", e.getMessage());
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

    private String generarCodigoRastreo() {
        return "TRM-" + UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase(Locale.ROOT);
    }
}
