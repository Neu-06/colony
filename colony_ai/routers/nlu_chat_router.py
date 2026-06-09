from fastapi import APIRouter
from pydantic import BaseModel
import sys
import os

# Ajustar sys.path para importaciones
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from deep_learning.tf_nlu_reportes import NLUReportPredictor
from services.report_generator import ReportGenerator

router = APIRouter(
    prefix="/api/v1/chat",
    tags=["Chat NLU & Voice"]
)

# Instancias
nlu_model = NLUReportPredictor()
report_gen = ReportGenerator()

class ChatRequest(BaseModel):
    message: str

@router.post("/nlu")
async def process_chat(req: ChatRequest):
    analysis = nlu_model.analyze_intent(req.message)
    intent = analysis["intent"]
    entities = analysis["entities"]
    
    response = {
        "text": "",
        "intent": intent,
        "entities": entities,
        "file": None
    }
    
    if intent == "AYUDA":
        response["text"] = "¡Hola! Soy el Asistente Analítico. Puedo generarte reportes de anomalías o cuellos de botella en Excel, PDF o Word. Solo pídemelo con tu voz."
    
    elif intent == "CONSULTA_ESTADO":
        # Respuesta genérica basada en la entidad
        if entities["tema"] == "anomalias":
            response["text"] = "Actualmente el sistema está monitoreando las anomalías. Si deseas el detalle completo, pídeme que genere un reporte en Excel o PDF."
        elif entities["tema"] == "cuellos":
            response["text"] = "He detectado algunas tareas con mayor latencia. Puedes decirme 'dame un informe en excel de los cuellos de botella' para descargarlo."
        else:
            response["text"] = "El sistema está estable. ¿Te gustaría que exporte algún reporte de métricas?"
            
    elif intent == "GENERAR_REPORTE":
        formato = entities["formato"] or "excel"
        tema = entities["tema"] or "anomalias"
        
        response["text"] = f"Generando tu reporte de {tema} en formato {formato.upper()}... ¡Listo! Iniciando descarga."
        
        try:
            file_data = report_gen.generate_report(tema, formato)
            response["file"] = file_data
        except Exception as e:
            response["text"] = f"Hubo un error generando el reporte: {str(e)}"
            
    return response
