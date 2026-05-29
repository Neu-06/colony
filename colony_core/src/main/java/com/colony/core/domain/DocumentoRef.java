package com.colony.core.domain;

import java.util.Date;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Referencia a un documento almacenado en S3.
 * Value object embebido en la entidad Instancia.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class DocumentoRef {
    private String documentoId;
    private String nombre;
    private String tipoMime;
    private String s3Key;
    private String subidoPor;
    private Date fechaSubida;
    private Long tamanoBytes;
}
