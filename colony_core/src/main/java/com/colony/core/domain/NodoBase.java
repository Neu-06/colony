package com.colony.core.domain;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import java.util.Map;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@JsonTypeInfo(
        use = JsonTypeInfo.Id.NAME,
        include = JsonTypeInfo.As.EXISTING_PROPERTY,
        property = "tipo",
        visible = true,
        defaultImpl = NodoActividad.class
)
@JsonSubTypes({
        @JsonSubTypes.Type(value = NodoActividad.class, name = "actividad"),
        @JsonSubTypes.Type(value = NodoActividad.class, name = "task"),
        @JsonSubTypes.Type(value = NodoActividad.class, name = "start"),
        @JsonSubTypes.Type(value = NodoActividad.class, name = "end"),
        @JsonSubTypes.Type(value = NodoCompuerta.class, name = "compuerta"),
        @JsonSubTypes.Type(value = NodoCompuerta.class, name = "gateway")
})
@JsonIgnoreProperties(ignoreUnknown = true)
public abstract class NodoBase {

    private String idNodo;
    private String tipo;
    private Map<String, Double> posicion;
        private String swimlaneId;
}
