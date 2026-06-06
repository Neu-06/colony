package com.colony.core.infrastructure.adapter;

import com.colony.core.application.ports.StoragePort;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;

import java.io.IOException;
import java.time.Duration;
import java.util.UUID;

@Slf4j
@Component
public class S3StorageAdapter implements StoragePort {

    private final S3Client s3Client;
    private final S3Presigner s3Presigner;

    @Value("${app.s3.bucket}")
    private String bucket;

    @Value("${app.s3.presigned-expiration-minutes:60}")
    private int defaultExpirationMinutes;

    public S3StorageAdapter(S3Client s3Client, S3Presigner s3Presigner) {
        this.s3Client = s3Client;
        this.s3Presigner = s3Presigner;
    }

    @Override
    public String upload(MultipartFile file, String instanciaId) {
        String originalFilename = (file.getOriginalFilename() != null)
                ? file.getOriginalFilename().replaceAll("[^a-zA-Z0-9._-]", "_")
                : "archivo";
        String key = "instancias/" + instanciaId + "/" + UUID.randomUUID() + "_" + originalFilename;

        try {
            PutObjectRequest putRequest = PutObjectRequest.builder()
                    .bucket(bucket)
                    .key(key)
                    .contentType(file.getContentType())
                    .contentLength(file.getSize())
                    .build();

            s3Client.putObject(putRequest, RequestBody.fromBytes(file.getBytes()));
            log.info("[S3] Archivo subido: bucket={}, key={}, size={}B", bucket, key, file.getSize());
            return key;

        } catch (IOException e) {
            log.error("[S3] Error al leer bytes del archivo: {}", e.getMessage(), e);
            throw new RuntimeException("Error al leer el archivo para subirlo a S3", e);
        } catch (Exception e) {
            log.error("[S3] Error al subir archivo: {}", e.getMessage(), e);
            throw new RuntimeException("Error al subir el archivo a S3: " + e.getMessage(), e);
        }
    }

    @Override
    public void delete(String storageKey) {
        try {
            s3Client.deleteObject(DeleteObjectRequest.builder()
                    .bucket(bucket)
                    .key(storageKey)
                    .build());
            log.info("[S3] Archivo eliminado: bucket={}, key={}", bucket, storageKey);
        } catch (Exception e) {
            log.error("[S3] Error al eliminar archivo: {}", e.getMessage(), e);
            throw new RuntimeException("Error al eliminar el archivo de S3: " + e.getMessage(), e);
        }
    }

    @Override
    public String getPresignedUrl(String storageKey, int expirationMinutes) {
        int minutes = (expirationMinutes > 0) ? expirationMinutes : defaultExpirationMinutes;
        try {
            GetObjectPresignRequest presignRequest = GetObjectPresignRequest.builder()
                    .signatureDuration(Duration.ofMinutes(minutes))
                    .getObjectRequest(GetObjectRequest.builder()
                            .bucket(bucket)
                            .key(storageKey)
                            .build())
                    .build();

            String url = s3Presigner.presignGetObject(presignRequest).url().toString();
            log.info("[S3] Presigned URL generada: key={}, expMin={}", storageKey, minutes);
            return url;
        } catch (Exception e) {
            log.error("[S3] Error al generar presigned URL: {}", e.getMessage(), e);
            throw new RuntimeException("Error al generar la URL de acceso: " + e.getMessage(), e);
        }
    }

    @Override
    public byte[] download(String storageKey) {
        try {
            software.amazon.awssdk.core.ResponseBytes<software.amazon.awssdk.services.s3.model.GetObjectResponse> resp =
                    s3Client.getObjectAsBytes(GetObjectRequest.builder()
                            .bucket(bucket)
                            .key(storageKey)
                            .build());
            log.info("[S3] Descargado: key={}, bytes={}", storageKey, resp.asByteArray().length);
            return resp.asByteArray();
        } catch (Exception e) {
            log.error("[S3] Error al descargar: {}", e.getMessage(), e);
            throw new RuntimeException("Error al descargar archivo de S3: " + e.getMessage(), e);
        }
    }

    @Override
    public String uploadBytes(byte[] data, String instanciaId, String filename, String contentType) {
        String safeName = filename.replaceAll("[^a-zA-Z0-9._-]", "_");
        String key = "instancias/" + instanciaId + "/" + UUID.randomUUID() + "_" + safeName;
        try {
            PutObjectRequest putRequest = PutObjectRequest.builder()
                    .bucket(bucket)
                    .key(key)
                    .contentType(contentType)
                    .contentLength((long) data.length)
                    .build();
            s3Client.putObject(putRequest, RequestBody.fromBytes(data));
            log.info("[S3] uploadBytes: key={}, size={}B", key, data.length);
            return key;
        } catch (Exception e) {
            log.error("[S3] Error en uploadBytes: {}", e.getMessage(), e);
            throw new RuntimeException("Error al subir bytes a S3: " + e.getMessage(), e);
        }
    }
}
