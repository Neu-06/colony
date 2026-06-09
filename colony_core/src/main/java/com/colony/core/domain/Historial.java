package com.colony.core.domain;

import java.util.Date;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.mapping.Document;

@Data
@NoArgsConstructor
@Document(collection = "historial")
@CompoundIndex(name = "idx_instancia_fecha", def = "{'instanciaID': 1, 'fechaIngreso': -1}")
@CompoundIndex(name = "idx_politica_nodo", def = "{'politicaId': 1, 'nodoDestino': 1}")
public class Historial {

    @Id
    private String id;
    private String instanciaID;
    private String politicaId;
    private String nodoOrigen;
    private String nodoDestino;
    private String ejecutadoPor;
    private String accionTomada;
    private Date fechaTransicion;
    private Double tiempoEnNodo;
    
    // Métricas de rendimiento
    private Date fechaIngreso;
    private Date fechaInicioAtencion;
    private Date fechaFinAtencion;
    private Long tiempoResolucionSegundos;
}
