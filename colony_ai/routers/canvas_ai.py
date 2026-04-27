import os
import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any, List
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

router = APIRouter(prefix="/api/v1/canvas", tags=["Canvas AI"])

# Validar llave de Groq
api_key = os.getenv("GROQ_API_KEY")
if not api_key:
    raise RuntimeError("GROQ_API_KEY no encontrada en el archivo .env")

# Inicializar cliente de Groq
client = Groq(api_key=api_key)

# Modelo de Groq (Llama 3.1 8B es más rápido y económico para pruebas)
AI_MODEL = "llama-3.1-8b-instant"

class CanvasData(BaseModel):
    data: Any

class IAResponse(BaseModel):
    faltaInicio: bool
    faltaFin: bool
    nodosSinConexion: List[str]
    sugerencias: List[str]

class CanvasChatRequest(BaseModel):
    canvasJson: dict  # Recibido desde Angular
    comando: str      # Recibido desde Angular

@router.post("/recommend", response_model=IAResponse)
async def recommend_flow(canvas: CanvasData):
    json_str = json.dumps(canvas.data)
    try:
        response = client.chat.completions.create(
            model=AI_MODEL,
            messages=[
                {"role": "system", "content": "Eres un analista experto en BPMN. Analiza el JSON y responde únicamente con un objeto JSON."},
                {"role": "user", "content": f"Analiza este flujo y devuelve un JSON con: {{'faltaInicio': bool, 'faltaFin': bool, 'nodosSinConexion': [], 'sugerencias': []}}. JSON: {json_str}"}
            ],
            response_format={"type": "json_object"}
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        print(f"🔥 ERROR EN RECOMMEND (GROQ): {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/fix")
async def fix_flow(canvas: CanvasData):
    json_str = json.dumps(canvas.data)
    try:
        response = client.chat.completions.create(
            model=AI_MODEL,
            messages=[
                {"role": "system", "content": "Eres un reparador de flujos BPMN. Devuelve el JSON corregido."},
                {"role": "user", "content": f"Repara este JSON si falta inicio/fin. Devuelve solo el JSON: {json_str}"}
            ],
            response_format={"type": "json_object"}
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        print(f"🔥 ERROR EN FIX (GROQ): {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/chat")
async def chat_canvas(request: CanvasChatRequest):
    try:
        json_str = json.dumps(request.canvasJson)
        
        response = client.chat.completions.create(
            model=AI_MODEL,
            messages=[
                {
                    "role": "system", 
                    "content": "Eres un copiloto BPMN. Analiza el JSON y la orden del usuario. Tienes libertad para modificar, eliminar o agregar nodos/aristas. Devuelve ÚNICAMENTE un JSON válido de jsPlumb que contenga las llaves 'nodos', 'aristas' y 'carriles'. Cero texto adicional."
                },
                {
                    "role": "user", 
                    "content": f"Comando: {request.comando}. JSON actual: {json_str}"
                }
            ],
            response_format={"type": "json_object"}
        )
        
        # Parseo del contenido de la respuesta de Groq
        resultado_ia = json.loads(response.choices[0].message.content)
        return resultado_ia
        
    except Exception as e:
        print(f"🔥 ERROR FATAL EN CHAT (GROQ): {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error en Chat Groq: {str(e)}")
