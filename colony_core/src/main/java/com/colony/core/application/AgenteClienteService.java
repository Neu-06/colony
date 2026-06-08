package com.colony.core.application;

import com.colony.core.application.dto.IniciarInstanciaRequest;
import com.colony.core.application.dto.IniciarInstanciaResponse;
import com.colony.core.application.ports.AiClientePort;
import com.colony.core.domain.Arista;
import com.colony.core.domain.NodoActividad;
import com.colony.core.domain.NodoBase;
import com.colony.core.domain.PoliticaNegocio;
import com.colony.core.infrastructure.repository.PoliticaNegocioRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class AgenteClienteService {

    private final PoliticaNegocioRepository politicaRepository;
    private final AiClientePort aiClientePort;
    private final MotorInstanciaService motorInstanciaService;

    public List<Map<String, Object>> obtenerFlujosPublicados() {
        List<PoliticaNegocio> publicadas = politicaRepository.findByEstadoOrderByFechaCreacionDesc("PUBLICADA");
        return construirContextoFlujos(publicadas);
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> procesarMensajeChat(
            String mensaje,
            List<Map<String, String>> historialChat,
            Map<String, Object> datosAcumulados,
            String identificadorCliente) {
        // Obtener flujos publicados y construir el contexto para la IA
        List<PoliticaNegocio> publicadas = politicaRepository.findByEstadoOrderByFechaCreacionDesc("PUBLICADA");
        List<Map<String, Object>> flujosParaIA = construirContextoFlujos(publicadas);

        if (flujosParaIA.isEmpty()) {
            return Map.of(
                    "flujoDetectado", null,
                    "flujoNombre", null,
                    "datosExtraidos", Map.of(),
                    "datosFaltantes", List.of(),
                    "preguntaSugerida", null,
                    "instanciarAhora", false,
                    "instanciaId", null,
                    "codigoTramite", null,
                    "mensajeAgente",
                    "En este momento no hay trámites disponibles para iniciar. Por favor consulta más tarde.",
                    "confianza", "baja");
        }

        // Llamar al microservicio de IA
        Map<String, Object> respuestaIA = aiClientePort.analizarIntencion(
                mensaje, historialChat, flujosParaIA, datosAcumulados);

        // Fusionar datos extraídos en esta vuelta con los acumulados de turnos previos
        Map<String, Object> datosExtraidos = (Map<String, Object>) respuestaIA.getOrDefault("datosExtraidos", Map.of());
        Map<String, Object> datosFusionados = new HashMap<>();
        if (datosAcumulados != null)
            datosFusionados.putAll(datosAcumulados);
        datosFusionados.putAll(datosExtraidos);

        // Si la IA dice que ya tiene todo → iniciar la instancia
        boolean instanciarAhora = Boolean.TRUE.equals(respuestaIA.get("instanciarAhora"));
        String flujoId = (String) respuestaIA.get("flujoDetectado");
        String instanciaId = null;
        String codigoTramite = null;

        if (instanciarAhora && flujoId != null && !flujoId.isBlank()) {
            try {
                String iniciadorId = (identificadorCliente != null && !identificadorCliente.isBlank())
                        ? identificadorCliente
                        : "cliente-anonimo";

                Map<String, Object> datosParaInstancia = new HashMap<>(datosFusionados);
                datosParaInstancia.remove("__flujoId__");

                IniciarInstanciaRequest iniciarReq = new IniciarInstanciaRequest(
                        flujoId, iniciadorId, datosParaInstancia);
                IniciarInstanciaResponse respuestaInstancia = motorInstanciaService.iniciar(iniciarReq);
                instanciaId = respuestaInstancia.instanciaId();
                codigoTramite = respuestaInstancia.codigoRastreo();

                log.info("[AgenteCliente] Instancia creada: id={}, codigo={}", instanciaId, codigoTramite);
            } catch (Exception e) {
                log.error("[AgenteCliente] Error al crear instancia: {}", e.getMessage());
                instanciarAhora = false;
            }
        }

        // Construir respuesta enriquecida
        Map<String, Object> respuesta = new LinkedHashMap<>(respuestaIA);
        respuesta.put("datosAcumulados", datosFusionados);
        respuesta.put("instanciarAhora", instanciarAhora && instanciaId != null);
        respuesta.put("instanciaId", instanciaId);
        respuesta.put("codigoTramite", codigoTramite);
        return respuesta;
    }

    private List<Map<String, Object>> construirContextoFlujos(List<PoliticaNegocio> politicas) {
        List<Map<String, Object>> resultado = new ArrayList<>();
        for (PoliticaNegocio p : politicas) {
            List<Map<String, Object>> camposRequeridos = extraerCamposInicio(p);
            Map<String, Object> flujoInfo = new LinkedHashMap<>();
            flujoInfo.put("flujoId", p.getId());
            flujoInfo.put("nombre", p.getNombre() != null ? p.getNombre() : "Sin nombre");
            flujoInfo.put("descripcion", p.getNombre() != null ? p.getNombre() : "");
            flujoInfo.put("camposRequeridos", camposRequeridos);
            resultado.add(flujoInfo);
        }
        return resultado;
    }

    private List<Map<String, Object>> extraerCamposInicio(PoliticaNegocio politica) {
        if (politica.getNodos() == null || politica.getAristas() == null) return List.of();

        String nodoInicioId = politica.getNodos().stream()
                .filter(n -> "inicio".equalsIgnoreCase(n.getTipo()))
                .map(NodoBase::getIdNodo)
                .findFirst()
                .orElse(null);

        if (nodoInicioId == null) return List.of();

        String primerNodoActividadId = politica.getAristas().stream()
                .filter(a -> a.getOrigenNodoId().equals(nodoInicioId))
                .map(Arista::getDestinoNodoId)
                .findFirst()
                .orElse(null);

        if (primerNodoActividadId == null) return List.of();

        String finalId = primerNodoActividadId;
        return politica.getNodos().stream()
                .filter(n -> n.getIdNodo().equals(finalId) && n instanceof NodoActividad)
                .map(n -> (NodoActividad) n)
                .findFirst()
                .map(nodo -> {
                    if (nodo.getEsquemaFormulario() == null) return List.<Map<String, Object>>of();
                    return nodo.getEsquemaFormulario().stream()
                            .map(campo -> {
                                Map<String, Object> c = new LinkedHashMap<>();
                                c.put("nombre", campo.getNombre());
                                c.put("tipo", campo.getTipo() != null ? campo.getTipo() : "text");
                                c.put("requerido", campo.isRequerido());
                                if (campo.getOpciones() != null && !campo.getOpciones().isBlank())
                                    c.put("opciones", campo.getOpciones());
                                return c;
                            })
                            .toList();
                })
                .orElse(List.of());
    }
}
