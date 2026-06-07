package com.colony.core.application.ports;

import java.util.List;
import java.util.Map;

public interface AiClientePort {

    Map<String, Object> analizarIntencion(
            String mensaje,
            List<Map<String, String>> historialChat,
            List<Map<String, Object>> flujos,
            Map<String, Object> datosAcumulados);
}
