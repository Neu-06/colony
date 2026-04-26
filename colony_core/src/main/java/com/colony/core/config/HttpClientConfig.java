package com.colony.core.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestTemplate;

/**
 * Configuración de beans de infraestructura HTTP.
 */
@Configuration
public class HttpClientConfig {

    /**
     * Bean de RestTemplate para llamadas HTTP salientes (ej: microservicio de IA).
     */
    @Bean
    public RestTemplate restTemplate() {
        return new RestTemplate();
    }
}
