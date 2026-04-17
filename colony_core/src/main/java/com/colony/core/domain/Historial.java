package com.colony.core.domain;

import java.util.Date;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

@Data
@NoArgsConstructor
@Document(collection = "historial")
public class Historial {

    @Id
    private String id;
    private String tramiteId;
    private String nodoOrigen;
    private String nodoDestino;
    private String ejecutadoPor;
    private String accionTomada;
    private Date fechaTransicion;
    private Double tiempoEnNodo;
}
