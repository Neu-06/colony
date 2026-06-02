package com.colony.core.application;

import com.colony.core.application.ports.StoragePort;
import com.colony.core.domain.*;
import com.colony.core.infrastructure.repository.AuditoriaDocumentoRepository;
import com.colony.core.infrastructure.repository.InstanciaRepository;
import com.colony.core.infrastructure.repository.PoliticaNegocioRepository;
import com.colony.core.infrastructure.repository.UsuarioRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.util.Date;
import java.util.List;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class DocumentoService {

    private final StoragePort storagePort;
    private final InstanciaRepository instanciaRepository;
    private final AuditoriaDocumentoRepository auditoriaRepository;
    private final PoliticaNegocioRepository politicaRepository;
    private final UsuarioRepository usuarioRepository;


    public DocumentoRef subirDocumento(String instanciaId,
            MultipartFile archivo,
            String usuarioId,
            String usuarioNombre) {

        Instancia instancia = obtenerOError(instanciaId);

        // Subir a S3
        String s3Key = storagePort.upload(archivo, instanciaId);

        // Construir referencia
        DocumentoRef ref = new DocumentoRef(
                UUID.randomUUID().toString(),
                archivo.getOriginalFilename() != null ? archivo.getOriginalFilename() : "archivo",
                archivo.getContentType(),
                s3Key,
                usuarioId,
                new Date(),
                archivo.getSize());

        // Agregar a la instancia (no destructivo)
        instancia.getDocumentosAdjuntos().add(ref);
        instanciaRepository.save(instancia);

        // Auditar
        auditar(ref.getDocumentoId(), instanciaId, "SUBIDA", usuarioId, usuarioNombre);

        log.info("[Docs] Subido: id={}, instancia={}, key={}", ref.getDocumentoId(), instanciaId, s3Key);
        return ref;
    }

    // Lista todos los documentos del repositorio de una instancia.
    public List<DocumentoRef> listarDocumentos(String instanciaId) {
        Instancia instancia = obtenerOError(instanciaId);
        List<DocumentoRef> docs = instancia.getDocumentosAdjuntos();
        return (docs != null) ? docs : List.of();
    }

    public String obtenerUrlAcceso(String instanciaId,
            String documentoId,
            String usuarioId,
            String usuarioNombre) {
        DocumentoRef ref = buscarDocumento(instanciaId, documentoId);
        String url = storagePort.getPresignedUrl(ref.getS3Key(), 0);
        auditar(documentoId, instanciaId, "VISTA", usuarioId, usuarioNombre);
        return url;
    }

    public void eliminarDocumento(String instanciaId,
            String documentoId,
            String usuarioId,
            String usuarioNombre) {
        Instancia instancia = obtenerOError(instanciaId);
        DocumentoRef ref = buscarDocumento(instanciaId, documentoId);

        storagePort.delete(ref.getS3Key());

        instancia.getDocumentosAdjuntos().removeIf(d -> d.getDocumentoId().equals(documentoId));
        instanciaRepository.save(instancia);

        auditar(documentoId, instanciaId, "ELIMINACION", usuarioId, usuarioNombre);
        log.info("[Docs] Eliminado: id={}, instancia={}", documentoId, instanciaId);
    }

    // Historial de auditoría de un documento específico.
    public List<AuditoriaDocumento> obtenerAuditoria(String documentoId) {
        return auditoriaRepository.findByDocumentoIdOrderByFechaDesc(documentoId);
    }

    // Toda la actividad documental de una instancia.
    public List<AuditoriaDocumento> obtenerAuditoriaInstancia(String instanciaId) {
        return auditoriaRepository.findByInstanciaIdOrderByFechaDesc(instanciaId);
    }

    public void registrarEdicion(String instanciaId,
            String documentoId,
            String usuarioId,
            String usuarioNombre) {
        auditar(documentoId, instanciaId, "EDICION", usuarioId, usuarioNombre);
    }

    public PermisoDocumental resolverPermiso(String instanciaId, String nodoId, String usuarioEmail) {
        Instancia instancia = obtenerOError(instanciaId);

        PoliticaNegocio politica = politicaRepository.findById(instancia.getPoliticaId())
                .orElse(null);
        if (politica == null) {
            return PermisoDocumental.SOLO_LECTURA;
        }

        NodoActividad nodo = politica.getNodos().stream()
                .filter(n -> n.getIdNodo().equals(nodoId) && n instanceof NodoActividad)
                .map(n -> (NodoActividad) n)
                .findFirst()
                .orElse(null);

        if (nodo == null || nodo.getPermisosDocumental() == null || nodo.getPermisosDocumental().isEmpty()) {
            return PermisoDocumental.SUBIR_Y_LEER;
        }

        Usuario usuario = usuarioRepository.findByEmail(usuarioEmail).orElse(null);
        String carrilDelUsuario = null;
        if (usuario != null && usuario.getDepartamentoId() != null) {
            carrilDelUsuario = politica.getCarriles() == null ? null :
                politica.getCarriles().stream()
                    .filter(c -> usuario.getDepartamentoId().equals(c.getDepartamentoId()))
                    .map(Carril::getId)
                    .findFirst()
                    .orElse(null);
        }

        final String carrilFinal = carrilDelUsuario;
        if (carrilFinal == null) {
            return PermisoDocumental.SOLO_LECTURA;
        }

        return nodo.getPermisosDocumental().stream()
                .filter(p -> carrilFinal.equals(p.getCarrilId()))
                .map(PermisoDocumentalCarril::getPermiso)
                .findFirst()
                .orElse(PermisoDocumental.SOLO_LECTURA);
    }

    private Instancia obtenerOError(String instanciaId) {
        return instanciaRepository.findById(instanciaId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Instancia no encontrada: " + instanciaId));
    }

    private DocumentoRef buscarDocumento(String instanciaId, String documentoId) {
        Instancia instancia = obtenerOError(instanciaId);
        List<DocumentoRef> docs = instancia.getDocumentosAdjuntos();
        if (docs == null) {
            docs = List.of();
        }
        return docs.stream()
                .filter(d -> d.getDocumentoId().equals(documentoId))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Documento no encontrado: " + documentoId));
    }

    private void auditar(String documentoId, String instanciaId,
            String accion, String usuarioId, String usuarioNombre) {
        AuditoriaDocumento registro = new AuditoriaDocumento(
                null, documentoId, instanciaId, accion,
                usuarioId, usuarioNombre, new Date(), null);
        auditoriaRepository.save(registro);
    }
}
