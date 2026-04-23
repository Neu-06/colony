package com.colony.core.domain;

import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

@Data
@NoArgsConstructor
@Document(collection = "departamentos")
public class Departamento {
    @Id
    private String id;
    private String nombre;
    private String activo;
}
