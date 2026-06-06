package com.colony.core.application.dto;

import lombok.Data;

/**
 * DTO con la configuración que necesita el SDK de OnlyOffice
 * para inicializar el editor colaborativo en el frontend.
 */
@Data
public class OnlyOfficeConfigDto {

    private String documentServerUrl;

    // ─── document ───────────────────────────────────────────────────
    private String documentKey;
    private String documentUrl;
    private String documentTitle;
    private String documentFileType;   // "docx" | "xlsx" …

    // ─── editor ─────────────────────────────────────────────────────
    private String callbackUrl;
    private String mode;               // "edit" | "view"

    // ─── user ───────────────────────────────────────────────────────
    private String userId;
    private String userName;

    // ─── permisos ───────────────────────────────────────────────────
    private boolean edit;
    private boolean download;
    private boolean print;
}
