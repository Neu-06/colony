package com.colony.core.domain;

import java.util.Date;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class Observacion {

    private String texto;
    private String autorId;
    private Date fecha;
}
