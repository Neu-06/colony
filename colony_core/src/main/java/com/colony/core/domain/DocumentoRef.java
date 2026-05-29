package com.colony.core.domain;

import java.util.Date;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Value object embebido en Instancia para referenciar documentos almacenados en
 * AWS S3.
 * No tiene colección propia; vive dentro de la lista documentosAdjuntos de
 * Instancia.
 * CU16 — Gestionar Repositorio Documental Colaborativo (Ciclo 2)
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
