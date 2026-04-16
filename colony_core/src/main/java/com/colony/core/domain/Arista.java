package com.colony.core.domain;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class Arista {

    private String origenNodoId;
    private String destinoNodoId;
    private String sourceOutputKey;
    private String targetInputKey;
}
