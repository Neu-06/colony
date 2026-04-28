package com.colony.core.application;

import com.google.firebase.messaging.FirebaseMessaging;
//import com.google.firebase.messaging.FirebaseMessagingException;
import com.google.firebase.messaging.MulticastMessage;
import com.google.firebase.messaging.Notification;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import com.google.firebase.messaging.BatchResponse;
import com.google.firebase.messaging.SendResponse;

@Slf4j
@Service
public class PushNotificationService {

    public void enviarNotificacion(List<String> tokens, String titulo, String cuerpo) {
        if (tokens == null || tokens.isEmpty()) {
            return;
        }

        try {
            Notification notification = Notification.builder()
                    .setTitle(titulo)
                    .setBody(cuerpo)
                    .build();

            MulticastMessage message = MulticastMessage.builder()
                    .setNotification(notification)
                    .addAllTokens(tokens)
                    .build();

            BatchResponse response = FirebaseMessaging.getInstance().sendEachForMulticast(message);
            
            log.info("Notificaciones enviadas. Éxitos: {}, Fallos: {}", response.getSuccessCount(), response.getFailureCount());
            
            if (response.getFailureCount() > 0) {
                List<SendResponse> responses = response.getResponses();
                for (int i = 0; i < responses.size(); i++) {
                    if (!responses.get(i).isSuccessful()) {
                        log.error("Fallo al enviar a token [{}]: {}", tokens.get(i), responses.get(i).getException().getMessage());
                    }
                }
            }
        } catch (Exception e) {
            log.error("Error al intentar comunicarse con Firebase FCM: ", e);
        }
    }
}
