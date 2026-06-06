package com.colony.core.application.ports;

import org.springframework.web.multipart.MultipartFile;

public interface StoragePort {

    String upload(MultipartFile file, String instanciaId);

    void delete(String storageKey);

    String getPresignedUrl(String storageKey, int expirationMinutes);

    /** Descarga el objeto de S3 y lo devuelve como bytes. */
    byte[] download(String storageKey);

    /** Sube bytes crudos con un nombre y tipo MIME dado; retorna la key de S3. */
    String uploadBytes(byte[] data, String instanciaId, String filename, String contentType);
}

