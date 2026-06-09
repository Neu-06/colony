import os
import numpy as np
import re

try:
    import tensorflow as tf
    from tensorflow.keras.models import Sequential
    from tensorflow.keras.layers import TextVectorization, Embedding, Dense, GlobalAveragePooling1D, Dropout
    TF_AVAILABLE = True
except ImportError:
    TF_AVAILABLE = False
    print("Warning: TensorFlow not installed. NLU Model will run in mock mode.")

class NLUReportPredictor:
    def __init__(self):
        self.model = None
        self.vectorizer = None
        self.is_trained = False
        
        # 0: GENERAR_REPORTE, 1: CONSULTA_ESTADO, 2: AYUDA
        self.intent_labels = ["GENERAR_REPORTE", "CONSULTA_ESTADO", "AYUDA"]
        
        if TF_AVAILABLE:
            self._build_model()
            self._train_initial_corpus()
            
    def _build_model(self):
        if not TF_AVAILABLE: return
        
        self.vectorizer = TextVectorization(max_tokens=2000, output_sequence_length=20)
        self.model = Sequential([
            self.vectorizer,
            Embedding(input_dim=2000, output_dim=16),
            GlobalAveragePooling1D(),
            Dense(16, activation='relu'),
            Dropout(0.2),
            Dense(len(self.intent_labels), activation='softmax')
        ])
        
        self.model.compile(optimizer='adam', loss='sparse_categorical_crossentropy', metrics=['accuracy'])

    def _train_initial_corpus(self):
        # Generar un corpus sintético robusto
        corpus_reportes = [
            "quiero un reporte en excel", "dame un pdf de las anomalias", "exportar datos a word", 
            "necesito el reporte de metricas en formato excel", "descarga un archivo pdf con los cuellos de botella",
            "generame un informe en excel por favor", "quiero descargar en word las tareas", 
            "hazme un reporte pdf de riesgos", "imprime los datos en excel", "exporta los kpis a word",
            "puedes generar un pdf", "dame el excel de procesos", "quiero descargar la data en excel",
            "reporte excel", "reporte pdf", "exportar a word", "quiero que me pases un pdf", "dame un reporte",
            "prepara un documento en excel con las anomalias", "sacame un informe en pdf"
        ]
        
        corpus_consulta = [
            "como esta el sistema", "cuantas anomalias hay", "dime los riesgos actuales",
            "hay cuellos de botella", "resumen del sistema", "que tareas estan lentas",
            "cual es la salud del flujo", "cuantos procesos hay", "analiza el rendimiento",
            "que recomiendas", "explicame los retrasos", "por que hay tanta demora",
            "muestrame las estadisticas", "dime el estado de las tareas", "como van los procesos",
            "hay algun problema", "cuales son las metricas", "que esta pasando", "analisis general",
            "dame un resumen", "explicame los riesgos", "cual es el cuello de botella principal"
        ]
        
        corpus_ayuda = [
            "hola", "buenos dias", "que puedes hacer", "ayuda", "quien eres", 
            "hola asistente", "necesito ayuda", "que opciones tengo", "saludos"
        ]
        
        texts = corpus_reportes + corpus_consulta + corpus_ayuda
        labels = [0]*len(corpus_reportes) + [1]*len(corpus_consulta) + [2]*len(corpus_ayuda)
        
        # Shuffle
        import random
        combined = list(zip(texts, labels))
        random.shuffle(combined)
        X = [item[0] for item in combined]
        y = np.array([item[1] for item in combined])
        
        self.vectorizer.adapt(X)
        
        # Convert X to a tensor of strings to avoid numpy dtype issues
        X_tensor = tf.constant(X)
        self.model.fit(X_tensor, y, epochs=50, batch_size=4, verbose=0)
        self.is_trained = True

    def extract_entities(self, text):
        text = text.lower()
        entities = {"formato": None, "tema": "general"}
        
        # Formato
        if "excel" in text or "xls" in text: entities["formato"] = "excel"
        elif "pdf" in text: entities["formato"] = "pdf"
        elif "word" in text or "doc" in text: entities["formato"] = "word"
        
        # Tema
        if "anomalia" in text or "riesgo" in text or "critico" in text: entities["tema"] = "anomalias"
        elif "cuello" in text or "retraso" in text or "demora" in text or "lenta" in text: entities["tema"] = "cuellos"
        elif "kpi" in text or "metrica" in text or "proceso" in text: entities["tema"] = "metricas"
        
        return entities

    def analyze_intent(self, text):
        if not TF_AVAILABLE or not self.is_trained:
            return {"intent": "CONSULTA_ESTADO", "entities": self.extract_entities(text)}
            
        text_tensor = tf.constant([text])
        pred = self.model.predict(text_tensor, verbose=0)[0]
        clase = np.argmax(pred)
        confidence = float(pred[clase])
        
        intent = self.intent_labels[clase]
        entities = self.extract_entities(text)
        
        # Corrección si la confianza es baja o es ambiguo
        if confidence < 0.6:
            intent = "CONSULTA_ESTADO"
            
        # Si predice GENERAR_REPORTE pero no hay un formato explícito en el texto, asume que solo es consulta
        if intent == "GENERAR_REPORTE" and not entities["formato"] and "reporte" not in text and "informe" not in text:
            intent = "CONSULTA_ESTADO"
            
        return {
            "intent": intent,
            "confidence": confidence,
            "entities": entities
        }
