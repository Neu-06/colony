"""
Router del Chat NLU — Colony BPMS AI.

Pipeline de despacho:
1. Análisis de intención con TensorFlow (LSTM Multi-Output)
2. Si baja confianza + no hay datos → Knowledge Base semántica (TF-IDF)
3. Despacho a consulta conversacional o generación de reporte

Sin APIs externas. Todo local.
"""
from fastapi import APIRouter
from pydantic import BaseModel
import sys, os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from deep_learning.tf_nlu_reportes import NLUReportPredictor
from services.report_generator import ReportGenerator
from services.knowledge_base import KnowledgeBase

router = APIRouter(prefix="/api/v1/chat", tags=["Chat NLU & Voice"])

# ── Singletons — se crean una sola vez al arrancar ──────────────
nlu_model  = NLUReportPredictor()
report_gen = ReportGenerator()
kb         = KnowledgeBase()

# Umbral de confianza por debajo del cual el KB puede intervenir
_KB_FALLBACK_THRESHOLD = 0.50


class ChatRequest(BaseModel):
    message: str


@router.post("/nlu")
async def process_chat(req: ChatRequest):
    text = req.message.strip()

    if not text:
        return {"text": "No recibí ningún mensaje. ¿En qué puedo ayudarte?",
                "intent": "AYUDA", "entities": {}, "file": None}

    # ── 1. Análisis de intención TensorFlow ─────────────────────
    try:
        analysis = nlu_model.analyze_intent(text)
        intent   = analysis["intent"]
        entities = analysis["entities"]
        conf     = analysis.get("conf", 1.0)
    except Exception as e:
        print(f"[Router] Error NLU: {e}")
        intent, entities, conf = "CONSULTA_ESTADO", {
            "formato": "ninguno", "tema": "general",
            "limite": 100, "orden": "desc", "umbral_pct": 0.0
        }, 0.0

    response = {"text": "", "intent": intent, "entities": entities, "file": None}

    # ── 2. Despacho principal ────────────────────────────────────
    if intent == "AYUDA":
        response["text"] = report_gen.nlg.ayuda()

    elif intent == "CONSULTA_ESTADO":
        try:
            entities["formato"] = "ninguno"
            result = report_gen.generate_dynamic_report(text, entities)
            text_resp = result["resumen_chat"]

            # ── 3. Fallback KB si la respuesta es vacía o insuficiente ──
            if _respuesta_insuficiente(text_resp) and kb.is_available():
                kb_resp, kb_sim = kb.search(text)
                if kb_resp:
                    text_resp = kb_resp

            # ── 4. Fallback KB cuando confianza del LSTM es baja ────────
            elif conf < _KB_FALLBACK_THRESHOLD and kb.is_available():
                kb_resp, kb_sim = kb.search(text)
                if kb_resp and kb_sim >= 0.30:
                    # Combinar respuesta KB con datos si existen
                    text_resp = kb_resp

            response["text"] = text_resp

        except Exception as e:
            print(f"[Router] Error CONSULTA_ESTADO: {e}")
            # Último recurso: KB
            if kb.is_available():
                kb_resp, _ = kb.search(text)
                response["text"] = kb_resp or (
                    "Tuve un problema consultando la base de datos. "
                    "Por favor intenta de nuevo en unos segundos."
                )
            else:
                response["text"] = (
                    "Tuve un problema consultando los datos en este momento."
                )

    elif intent == "GENERAR_REPORTE":
        try:
            result = report_gen.generate_dynamic_report(text, entities)
            response["text"] = result["resumen_chat"]
            response["file"] = result["archivo"]
        except Exception as e:
            print(f"[Router] Error GENERAR_REPORTE: {e}")
            response["text"] = (
                "Hubo un error preparando tu reporte. "
                "Verifica que el sistema esté activo y vuelve a intentarlo."
            )

    return response


def _respuesta_insuficiente(text: str) -> bool:
    """Detecta si la respuesta generada está vacía o es un placeholder."""
    if not text or len(text.strip()) < 20:
        return True
    frases_vacias = [
        "no encontré", "no hay datos", "0 trámites", "0 etapas",
        "base de datos", "error", "sin resultados"
    ]
    t = text.lower()
    return any(f in t for f in frases_vacias) and len(text) < 100
