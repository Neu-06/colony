package com.colony.core.infrastructure.controller;

import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.handler.annotation.SendTo;
import org.springframework.stereotype.Controller;
import java.util.Map;

@Controller
public class CollaborativeWorkflowController {

    @MessageMapping("/canvas/{canvasId}/action")
    @SendTo("/topic/canvas/{canvasId}")
    public Map<String, Object> handleCanvasAction(@DestinationVariable String canvasId, @Payload Map<String, Object> action) {
        // Simplemente retransmitimos la acción a todos los usuarios suscritos a ese canvas
        return action;
    }
}
