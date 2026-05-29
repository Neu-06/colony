package com.colony.core.application.events;

public record InstanciaAvanzadaEvent(

        String instanciaId,
        String politicaId,
        String nodoOrigenId) {
}
