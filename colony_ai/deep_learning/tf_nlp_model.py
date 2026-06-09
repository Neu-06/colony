import os
import numpy as np

# Intentamos importar tensorflow; si falla, mockeamos para no romper FastAPI en entornos sin TF
try:
    import tensorflow as tf
    from tensorflow.keras.models import Sequential
    from tensorflow.keras.layers import TextVectorization, Embedding, Dense, GlobalAveragePooling1D
    TF_AVAILABLE = True
except ImportError:
    TF_AVAILABLE = False
    print("Warning: TensorFlow not installed. NLP Model will run in mock mode.")

class NLPModelPredictor:
    def __init__(self):
        self.model = None
        self.vectorizer = None
        self.is_trained = False
        
        if TF_AVAILABLE:
            self._build_model()
            
    def _build_model(self):
        if not TF_AVAILABLE: return
        
        self.vectorizer = TextVectorization(max_tokens=5000, output_sequence_length=100)
        self.model = Sequential([
            self.vectorizer,
            Embedding(input_dim=5000, output_dim=16),
            GlobalAveragePooling1D(),
            Dense(16, activation='relu'),
            Dense(3, activation='softmax') # 3 clases de urgencia (0: BAJA, 1: MEDIA, 2: ALTA)
        ])
        
        self.model.compile(optimizer='adam', loss='sparse_categorical_crossentropy', metrics=['accuracy'])

    def train(self, texts, labels):
        if not TF_AVAILABLE or len(texts) < 10:
            return False
            
        # labels: lista de enteros 0, 1, 2
        X = tf.constant(texts)
        y = np.array(labels)
        
        self.vectorizer.adapt(X)
        self.model.fit(X, y, epochs=10, batch_size=32, verbose=0)
        self.is_trained = True
        return True

    def predict_urgency(self, text):
        """
        Retorna la clase predicha (1, 2 o 3 correspondientes a BAJA, MEDIA, ALTA)
        """
        if not TF_AVAILABLE or not self.is_trained:
            # Fallback mock si no está entrenado o no hay TF
            text_lower = text.lower()
            if "urgente" in text_lower or "emergencia" in text_lower or "fatal" in text_lower:
                return 3
            if "problema" in text_lower or "ayuda" in text_lower:
                return 2
            return 1
            
        text_tensor = tf.constant([text])
        pred = self.model.predict(text_tensor, verbose=0)[0]
        clase = np.argmax(pred)
        return int(clase) + 1 # 1: BAJA, 2: MEDIA, 3: ALTA
