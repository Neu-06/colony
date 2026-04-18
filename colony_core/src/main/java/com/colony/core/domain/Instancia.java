package com.colony.core.domain;

import java.util.Date;
import java.util.List;
import java.util.Map;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

@Data
@NoArgsConstructor
@Document(collection = "instancias")
public class Instancia {

    @Id
    private String id;

    @Indexed(unique = true)
    private String codigo;
    private String politicaId;
    private String iniciadoPor;
    private String estadoGeneral;
    private String nodoActual;
    private String semaforo;
    private Map<String, Object> datosDinamicos;
    private List<Observacion> observaciones;
    private Date fechaInicio;
    private Date fechaFin;
    private List<String> dispositivosSuscritos;
}
