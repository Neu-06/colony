package com.colony.core.domain;

import java.util.Date;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.mapping.Document;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "auditoria_documentos")
@CompoundIndex(name = "idx_doc_fecha", def = "{'documentoId': 1, 'fecha': -1}")
public class AuditoriaDocumento {

    @Id
    private String id;
    private String documentoId;
    private String instanciaId;
    private String accion;
    private String usuarioId;
    private String usuarioNombre;
    private Date fecha;
    private String ipCliente;
}
