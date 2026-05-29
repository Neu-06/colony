package com.colony.core.application.events;

import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class PrediccionEventListener {

    @Async
    @EventListener
    public void onInstanciaAvanzada(InstanciaAvanzadaEvent event) {
        log.info("Evento recibido: instanciaId={}, politicaId={}, nodoOrigen={}",
                event.instanciaId(), event.politicaId(), event.nodoOrigenId());
    }
}
