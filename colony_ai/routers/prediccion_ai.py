from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, Optional
import time

from deep_learning.tf_nlp_model import NLPModelPredictor
from deep_learning.tf_routing_model import RoutingAndAnomalyModel

# Instancias Globales de los Modelos
nlp_model = NLPModelPredictor()
routing_model = RoutingAndAnomalyModel()

router = APIRouter(
    prefix="/api/v1/prediccion",
    tags=["Predicciones ML"]
)

class PrediccionRequest(BaseModel):
    instanciaId: str
    politicaId: str
    nodoActualId: str
    datosDinamicos: Dict[str, Any]

class EntrenamientoRequest(BaseModel):
    politicaId: str

@router.post("/analizar")
async def analizar_instancia(req: PrediccionRequest):
    """
    Evalúa el riesgo, anomalía y prioridad de una instancia
    en tiempo real cada vez que avanza en el motor BPMS.
    """
    #NLP Prioridad: Analizar todos los textos en datosDinamicos
    text_content = ""
    for k, v in req.datosDinamicos.items():
        if isinstance(v, str) and len(v) > 10:
            text_content += v + " "
            
    prioridad = nlp_model.predict_urgency(text_content) if text_content else 1
    
    #Riesgo y Anomalía
    # En un caso real, leeríamos el tiempo acumulado de la base de datos
    # Para la demostración, derivamos features de los datos dinámicos simulados
    historial_count = len(req.datosDinamicos) # Aproximación
    avg_time = 3600.0 # Aproximación
    
    riesgo, anomalia = routing_model.predict(historial_count, avg_time, prioridad)
    
    # Simulación extra si el modelo falla o no está entrenado (fallback inteligente)
    if "urgente" in text_content.lower():
        prioridad = max(prioridad, 3)
        riesgo = max(riesgo, 0.6)
        
    return {
        "instanciaId": req.instanciaId,
        "riesgo": round(riesgo, 2),
        "prioridad": prioridad,
        "esAnomalia": anomalia,
        "mejorSiguienteNodo": None # Por implementar
    }

def entrenar_modelos_task(politica_id: str):
    """ Tarea en background para re-entrenar con la DB actual """
    print(f"Iniciando entrenamiento de modelos para política {politica_id}...")
    # Aquí iría la conexión a MongoDB para extraer historiales reales
    time.sleep(5) # Simulación de tiempo de entrenamiento
    print(f"Entrenamiento completado para {politica_id}")

@router.post("/entrenar")
async def entrenar_modelos(req: EntrenamientoRequest, bg_tasks: BackgroundTasks):
    bg_tasks.add_task(entrenar_modelos_task, req.politicaId)
    return {"status": "entrenamiento_iniciado", "mensaje": "Los modelos se están entrenando en background"}
