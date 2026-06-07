package com.colony.core.application;

import com.colony.core.application.dto.OnlyOfficeConfigDto;
import com.colony.core.application.ports.StoragePort;
import com.colony.core.domain.*;
import com.colony.core.infrastructure.repository.AuditoriaDocumentoRepository;
import com.colony.core.infrastructure.repository.InstanciaRepository;
import com.colony.core.infrastructure.repository.PoliticaNegocioRepository;
//import com.colony.core.infrastructure.repository.UsuarioRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

//import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
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
    // private final UsuarioRepository usuarioRepository;

    @Value("${app.onlyoffice.server-url:http://localhost:8100}")
    private String onlyOfficeServerUrl;

    // URL que OnlyOffice (en Docker) usa para acceder al backend.
    // Dentro del contenedor 'localhost' != host, se usa host.docker.internal
    @Value("${app.onlyoffice.backend-url:http://host.docker.internal:8080}")
    private String onlyOfficeBackendUrl;

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
        DocumentoRef ref = instancia.getDocumentosAdjuntos().stream()
                .filter(d -> d.getDocumentoId().equals(documentoId))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Documento no encontrado"));

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

        if (nodo == null || nodo.getPermisoDocumental() == null) {
            return PermisoDocumental.SUBIR_Y_LEER;
        }

        return nodo.getPermisoDocumental();
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

    // ─── OnlyOffice ────────────────────────────────────────────────────────────

    /**
     * Devuelve la configuración que necesita el SDK de OnlyOffice
     * para inicializar el editor colaborativo.
     */
    public OnlyOfficeConfigDto generarConfigOnlyOffice(
            String instanciaId,
            String documentoId,
            String usuarioEmail,
            String backendBaseUrl,
            boolean modoEdicion) {

        DocumentoRef ref = buscarDocumento(instanciaId, documentoId);
        String extension = extensionDe(ref.getNombre());
        // String mimeType = ref.getTipoMime() != null ? ref.getTipoMime() : "";

        // URL que OnlyOffice descarga (debe ser alcanzable desde el contenedor Docker)
        String documentUrl = onlyOfficeBackendUrl + "/api/documentos/" + instanciaId + "/" + documentoId + "/contenido";
        String callbackUrl = onlyOfficeBackendUrl + "/api/documentos/" + instanciaId + "/" + documentoId
                + "/onlyoffice-callback";

        // Key única por documento (OnlyOffice cachea por key; cambiar key fuerza
        // recarga). Usamos el s3Key porque este cambia en cada guardado.
        String key = documentoId + "_" + (ref.getS3Key() != null ? Math.abs(ref.getS3Key().hashCode()) : ref.getFechaSubida().getTime());

        OnlyOfficeConfigDto dto = new OnlyOfficeConfigDto();
        dto.setDocumentServerUrl(onlyOfficeServerUrl);
        dto.setDocumentKey(key);
        dto.setDocumentUrl(documentUrl);
        dto.setDocumentTitle(ref.getNombre());
        dto.setDocumentFileType(extension);
        dto.setCallbackUrl(callbackUrl);
        dto.setMode(modoEdicion ? "edit" : "view");
        dto.setUserId(usuarioEmail);
        dto.setUserName(usuarioEmail);
        dto.setEdit(modoEdicion);
        dto.setDownload(true);
        dto.setPrint(true);
        return dto;
    }

    /**
     * Devuelve los bytes del documento directamente (para que OnlyOffice lo
     * descargue).
     */
    public byte[] obtenerContenido(String instanciaId, String documentoId) {
        DocumentoRef ref = buscarDocumento(instanciaId, documentoId);
        return storagePort.download(ref.getS3Key());
    }

    /**
     * Callback de OnlyOffice: cuando todos salen del editor, OnlyOffice notifica
     * con status=2 y una URL de descarga del archivo actualizado.
     * Aquí descargamos ese archivo y lo guardamos de vuelta en S3.
     */
    public void procesarCallbackOnlyOffice(
            String instanciaId, String documentoId,
            int status, String downloadUrl, String usuarioId) {

        // status 2 = documento guardado (todos salieron); 6 = error. Solo procesamos 2.
        if (status != 2) {
            log.info("[OnlyOffice] Callback status={} para doc={}, ignorado.", status, documentoId);
            return;
        }

        try {
            log.info("[OnlyOffice] Guardando doc={} desde URL: {}", documentoId, downloadUrl);

            // Descargar el archivo actualizado desde la URL temporal de OnlyOffice
            HttpClient httpClient = HttpClient.newHttpClient();
            HttpRequest request = HttpRequest.newBuilder().uri(URI.create(downloadUrl)).GET().build();
            byte[] data = httpClient.send(request, HttpResponse.BodyHandlers.ofByteArray()).body();

            // Buscar el documento actual en la MISMA instancia que vamos a guardar
            Instancia instancia = obtenerOError(instanciaId);
            DocumentoRef ref = instancia.getDocumentosAdjuntos().stream()
                    .filter(d -> d.getDocumentoId().equals(documentoId))
                    .findFirst()
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Documento no encontrado"));

            // Eliminar el archivo antiguo de S3
            try {
                storagePort.delete(ref.getS3Key());
            } catch (Exception ignored) {
            }

            // Subir la nueva versión a S3
            String newKey = storagePort.uploadBytes(
                    data, instanciaId, ref.getNombre(),
                    ref.getTipoMime() != null ? ref.getTipoMime() : "application/octet-stream");

            // Actualizar la referencia en MongoDB
            ref.setS3Key(newKey);
            ref.setFechaSubida(new Date());
            ref.setTamanoBytes((long) data.length);
            instanciaRepository.save(instancia);

            auditar(documentoId, instanciaId, "EDICION", usuarioId, usuarioId);
            log.info("[OnlyOffice] Doc={} guardado correctamente. Nuevo key={}", documentoId, newKey);

        } catch (Exception e) {
            log.error("[OnlyOffice] Error guardando callback para doc={}: {}", documentoId, e.getMessage(), e);
            throw new RuntimeException("Error procesando callback de OnlyOffice", e);
        }
    }

    private String extensionDe(String filename) {
        if (filename == null)
            return "docx";
        int dot = filename.lastIndexOf('.');
        return (dot >= 0) ? filename.substring(dot + 1).toLowerCase() : "docx";
    }
}
