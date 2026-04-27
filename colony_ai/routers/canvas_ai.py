import os
import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any, List
from google import genai
from dotenv import load_dotenv

load_dotenv()

router = APIRouter(prefix="/api/v1/canvas", tags=["Canvas AI"])

# Validar llave
api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    raise RuntimeError("GEMINI_API_KEY no encontrada en el archivo .env")

# Inicializar cliente de Google GenAI
client = genai.Client(api_key=api_key)

# Configuración compartida para forzar salida JSON nativa en Gemini
GENAI_CONFIG = {"response_mime_type": "application/json"}

class CanvasData(BaseModel):
    data: Any

class IAResponse(BaseModel):
    faltaInicio: bool
    faltaFin: bool
    nodosSinConexion: List[str]
    sugerencias: List[str]

class CanvasChatRequest(BaseModel):
    canvas_data: dict
    comando_usuario: str

# Modelo preferido para velocidad y bajo costo
AI_MODEL = 'gemini-2.0-flash'

@router.post("/recommend", response_model=IAResponse)
async def recommend_flow(canvas: CanvasData):
    json_str = json.dumps(canvas.data)
    prompt = f"""
    Eres un analista experto en flujos de trabajo BPMN. 
    Analiza el siguiente JSON de un flujo.
    Responde ÚNICAMENTE con un JSON que cumpla esta estructura:
    {{"faltaInicio": bool, "faltaFin": bool, "nodosSinConexion": ["nodo_id"], "sugerencias": ["sug1", "sug2"]}}
    JSON a analizar:
    {json_str}
    """
    try:
        response = client.models.generate_content(
            model=AI_MODEL,
            contents=prompt,
            config=GENAI_CONFIG
        )
        return response.parsed
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/fix")
async def fix_flow(canvas: CanvasData):
    json_str = json.dumps(canvas.data)
    prompt = f"""
    Eres un reparador experto de JSON de jsPlumb para flujos BPMN. 
    Devuelve el MISMO JSON EXACTO, pero reparando si falta INICIO o FIN.
    Coordenadas 100,100 para nuevos nodos. No alteres IDs existentes.
    JSON a reparar:
    {json_str}
    """
    try:
        response = client.models.generate_content(
            model=AI_MODEL,
            contents=prompt,
            config=GENAI_CONFIG
        )
        return response.parsed
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/chat")
async def chat_canvas(request: CanvasChatRequest):
    json_str = json.dumps(request.canvas_data)
    prompt = f"""
    Eres un Copiloto de modelado BPMN. 
    Recibes un JSON de jsPlumb/Angular y un comando del usuario: '{request.comando_usuario}'. 
    Tienes 3 libertades absolutas:
    1) AGREGAR nodos o aristas nuevos si el usuario lo solicita.
    2) ELIMINAR nodos o aristas existentes (si eliminas un nodo, borra también sus conexiones).
    3) MODIFICAR textos (labels), posiciones (x, y) o tipos de nodos.
    
    Devuelve ÚNICAMENTE el JSON modificado conservando la estructura exacta (nodos[], aristas[]). 
    No agregues explicaciones ni formato markdown.
    JSON actual:
    {json_str}
    """
    try:
        response = client.models.generate_content(
            model=AI_MODEL,
            contents=prompt,
            config=GENAI_CONFIG
        )
        return response.parsed
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error en Chat IA: {str(e)}")
