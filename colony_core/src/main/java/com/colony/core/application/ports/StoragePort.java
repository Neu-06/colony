package com.colony.core.application.ports;

import org.springframework.web.multipart.MultipartFile;

public interface StoragePort {

    String upload(MultipartFile file, String instanciaId);

    void delete(String storageKey);

    String getPresignedUrl(String storageKey, int expirationMinutes);
}
