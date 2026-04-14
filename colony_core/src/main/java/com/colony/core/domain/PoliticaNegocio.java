package com.colony.core.domain;

import java.util.Date;
import java.util.List;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

@Data
@NoArgsConstructor
@Document(collection = "politicas_negocio")
public class PoliticaNegocio {

    @Id
    private String id;
    private String nombre;
    private String codigoInvitacion;
    private List<String> editoresAutorizados;
    private Integer version;
    private String estado;
    private String creadoPor;
    private Date fechaCreacion;
    private List<NodoBase> nodos;
    private List<Arista> aristas;
}
