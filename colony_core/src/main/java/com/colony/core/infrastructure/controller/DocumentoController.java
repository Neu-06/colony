package com.colony.core.infrastructure.controller;

import com.colony.core.application.DocumentoService;
import com.colony.core.domain.AuditoriaDocumento;
import com.colony.core.domain.DocumentoRef;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/documentos")
@RequiredArgsConstructor
public class DocumentoController {

    private final DocumentoService documentoService;

    @PostMapping(value = "/subir/{instanciaId}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'ADMIN', 'FUNCIONARIO')")
    public ResponseEntity<DocumentoRef> subirDocumento(
            @PathVariable String instanciaId,
            @RequestParam("archivo") MultipartFile archivo,
            @AuthenticationPrincipal UserDetails userDetails) {

        String uid = userDetails.getUsername();
        DocumentoRef ref = documentoService.subirDocumento(instanciaId, archivo, uid, uid);
        return ResponseEntity.ok(ref);
    }

    @GetMapping("/{instanciaId}")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'ADMIN', 'FUNCIONARIO')")
    public ResponseEntity<List<DocumentoRef>> listarDocumentos(@PathVariable String instanciaId) {
        return ResponseEntity.ok(documentoService.listarDocumentos(instanciaId));
    }

    @GetMapping("/{instanciaId}/{documentoId}/url")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'ADMIN', 'FUNCIONARIO')")
    public ResponseEntity<Map<String, String>> obtenerUrl(
            @PathVariable String instanciaId,
            @PathVariable String documentoId,
            @AuthenticationPrincipal UserDetails userDetails) {

        String uid = userDetails.getUsername();
        String url = documentoService.obtenerUrlAcceso(instanciaId, documentoId, uid, uid);
        return ResponseEntity.ok(Map.of("url", url, "documentoId", documentoId));
    }

    @DeleteMapping("/{instanciaId}/{documentoId}")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'ADMIN')")
    public ResponseEntity<Void> eliminarDocumento(
            @PathVariable String instanciaId,
            @PathVariable String documentoId,
            @AuthenticationPrincipal UserDetails userDetails) {

        String uid = userDetails.getUsername();
        documentoService.eliminarDocumento(instanciaId, documentoId, uid, uid);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{instanciaId}/{documentoId}/auditoria")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'ADMIN', 'FUNCIONARIO')")
    public ResponseEntity<List<AuditoriaDocumento>> auditoriaDocumento(
            @PathVariable String instanciaId,
            @PathVariable String documentoId) {
        return ResponseEntity.ok(documentoService.obtenerAuditoria(documentoId));
    }

    @GetMapping("/{instanciaId}/auditoria")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'ADMIN', 'FUNCIONARIO')")
    public ResponseEntity<List<AuditoriaDocumento>> auditoriaInstancia(
            @PathVariable String instanciaId) {
        return ResponseEntity.ok(documentoService.obtenerAuditoriaInstancia(instanciaId));
    }

    @PostMapping("/{instanciaId}/{documentoId}/edicion")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'ADMIN', 'FUNCIONARIO')")
    public ResponseEntity<Void> registrarEdicion(
            @PathVariable String instanciaId,
            @PathVariable String documentoId,
            @AuthenticationPrincipal UserDetails userDetails) {

        String uid = userDetails.getUsername();
        documentoService.registrarEdicion(instanciaId, documentoId, uid, uid);
        return ResponseEntity.ok().build();
    }

    @GetMapping("/{instanciaId}/mi-permiso")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'ADMIN', 'FUNCIONARIO')")
    public ResponseEntity<Map<String, String>> miPermiso(
            @PathVariable String instanciaId,
            @RequestParam(required = false) String nodoId,
            @AuthenticationPrincipal UserDetails userDetails) {

        String email = userDetails.getUsername();
        com.colony.core.domain.PermisoDocumental permiso = nodoId != null && !nodoId.isBlank()
                ? documentoService.resolverPermiso(instanciaId, nodoId, email)
                : com.colony.core.domain.PermisoDocumental.SUBIR_Y_LEER;

        return ResponseEntity.ok(Map.of("permiso", permiso.name()));
    }
}
