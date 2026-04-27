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
    canvasJson: dict  # Llave exacta enviada por Angular
    comando: str      # Llave exacta enviada por Angular

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
        # Limpieza y parseo manual para seguridad
        return json.loads(response.text.strip())
    except Exception as e:
        print(f"🔥 ERROR EN RECOMMEND: {str(e)}")
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
        return json.loads(response.text.strip())
    except Exception as e:
        print(f"🔥 ERROR EN FIX: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/chat")
async def chat_canvas(request: CanvasChatRequest):
    try:
        json_str = json.dumps(request.canvasJson)
        prompt = f"""
        Eres un Copiloto de modelado BPMN de élite. 
        Recibes un JSON que representa nodos, aristas y carriles de un diagrama, y un comando del usuario: '{request.comando}'. 
        
        Tienes 3 libertades ABSOLUTAS:
        1) AGREGAR: Crea nuevos nodos o aristas si el usuario lo pide (ej: "Agrega un nodo de pago").
        2) ELIMINAR: Borra nodos o aristas (ej: "Borra el inicio"). Si borras un nodo, elimina todas sus aristas conectadas.
        3) MODIFICAR: Cambia nombres, posiciones (x, y) o tipos.
        
        IMPORTANTE: Devuelve ÚNICAMENTE el JSON modificado. No incluyas texto extra, ni markdown, ni explicaciones.
        MANTÉN LA ESTRUCTURA: {{"nodos": [], "aristas": [], "carriles": []}}
        
        JSON ACTUAL:
        {json_str}
        """
        
        response = client.models.generate_content(
            model=AI_MODEL,
            contents=prompt,
            config=GENAI_CONFIG
        )
        
        # Blindaje de parseo
        return json.loads(response.text.strip())
        
    except Exception as e:
        print(f"🔥 ERROR FATAL EN CHAT: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error en Chat IA: {str(e)}")
