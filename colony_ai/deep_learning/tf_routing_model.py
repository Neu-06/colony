import os
import numpy as np

try:
    import tensorflow as tf
    from tensorflow.keras.models import Sequential, Model
    from tensorflow.keras.layers import Dense, Dropout, Input
    TF_AVAILABLE = True
except ImportError:
    TF_AVAILABLE = False
    print("Warning: TensorFlow not installed. Routing Model will run in mock mode.")

class RoutingAndAnomalyModel:
    def __init__(self):
        self.risk_model = None
        self.anomaly_model = None
        self.is_trained = False
        
        # Hyperparams
        self.input_dim = 10  # Tamaño del vector de características
        
        if TF_AVAILABLE:
            self._build_models()
            
    def _build_models(self):
        if not TF_AVAILABLE: return
        
        # 1. Modelo DNN para Riesgo de Demora
        self.risk_model = Sequential([
            Dense(32, activation='relu', input_shape=(self.input_dim,)),
            Dropout(0.2),
            Dense(16, activation='relu'),
            Dense(1, activation='sigmoid') # Probabilidad de retraso (0 a 1)
        ])
        self.risk_model.compile(optimizer='adam', loss='binary_crossentropy', metrics=['accuracy'])
        
        # 2. Autoencoder para Detección de Anomalías
        inputs = Input(shape=(self.input_dim,))
        encoded = Dense(8, activation='relu')(inputs)
        encoded = Dense(4, activation='relu')(encoded)
        decoded = Dense(8, activation='relu')(encoded)
        decoded = Dense(self.input_dim, activation='linear')(decoded)
        
        self.anomaly_model = Model(inputs, decoded)
        self.anomaly_model.compile(optimizer='adam', loss='mse')

    def _extract_features(self, historial_count, avg_time, urgency):
        # Transforma los datos en un vector de tamaño 10
        vec = np.zeros(self.input_dim)
        vec[0] = min(historial_count / 10.0, 1.0)
        vec[1] = min(avg_time / 86400.0, 1.0)
        vec[2] = urgency / 3.0
        # Resto de características simuladas
        return vec

    def train(self, instances_data):
        """
        Entrena los modelos si hay suficiente data
        instances_data: list of dicts con keys (historial_count, avg_time, urgency, delayed, is_anomaly)
        """
        if not TF_AVAILABLE or len(instances_data) < 20:
            return False
            
        X = []
        y_risk = []
        X_normal = []
        
        for data in instances_data:
            vec = self._extract_features(data['historial_count'], data['avg_time'], data['urgency'])
            X.append(vec)
            y_risk.append(1 if data['delayed'] else 0)
            
            if not data['is_anomaly']:
                X_normal.append(vec)
                
        X = np.array(X)
        y_risk = np.array(y_risk)
        X_normal = np.array(X_normal)
        
        # Entrenamiento del modelo de riesgo
        self.risk_model.fit(X, y_risk, epochs=20, batch_size=16, verbose=0)
        
        # Entrenamiento del Autoencoder con datos normales
        if len(X_normal) > 10:
            self.anomaly_model.fit(X_normal, X_normal, epochs=20, batch_size=16, verbose=0)
            
        self.is_trained = True
        return True

    def predict(self, historial_count, avg_time, urgency):
        if not TF_AVAILABLE or not self.is_trained:
            # Fallback
            riesgo = 0.8 if avg_time > 86400 else 0.2
            anomalia = False
            return float(riesgo), anomalia
            
        vec = self._extract_features(historial_count, avg_time, urgency)
        vec_batch = np.array([vec])
        
        riesgo = self.risk_model.predict(vec_batch, verbose=0)[0][0]
        
        # Detección de anomalía usando el Autoencoder
        reconstructed = self.anomaly_model.predict(vec_batch, verbose=0)[0]
        mse = np.mean(np.square(vec - reconstructed))
        anomalia = bool(mse > 0.05)  # Umbral empírico
        
        return float(riesgo), anomalia
