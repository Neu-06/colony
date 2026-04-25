package com.colony.core.application;

import com.google.firebase.messaging.FirebaseMessaging;
//import com.google.firebase.messaging.FirebaseMessagingException;
import com.google.firebase.messaging.MulticastMessage;
import com.google.firebase.messaging.Notification;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

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

            FirebaseMessaging.getInstance().sendEachForMulticast(message);
        } catch (Exception e) {
            log.error("Error al enviar notificación Push: " + e.getMessage());
        }
    }
}
