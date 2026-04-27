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
                {
                    "role": "system", 
                    "content": "Eres un analista experto en BPMN. Analiza el JSON y responde ÚNICAMENTE con un objeto JSON. IMPORTANTE: El campo 'sugerencias' DEBE ser estrictamente un array de strings puros (ej: ['texto1', 'texto2']), NUNCA un array de objetos."
                },
                {
                    "role": "user", 
                    "content": f"Analiza este flujo y devuelve un JSON con: {{'faltaInicio': bool, 'faltaFin': bool, 'nodosSinConexion': ['id1'], 'sugerencias': ['mejorar x']}}. JSON: {json_str}"
                }
            ],
            response_format={"type": "json_object"}
        )
        
        result_dict = json.loads(response.choices[0].message.content)
        
        # --- BLINDAJE DE FORMATO ---
        raw_sugerencias = result_dict.get("sugerencias", [])
        clean_sugerencias = []
        for s in raw_sugerencias:
            if isinstance(s, dict):
                # Si la IA mandó un objeto, extraemos el primer valor que encontremos
                valor = next(iter(s.values())) if s else ""
                clean_sugerencias.append(str(valor))
            else:
                # Si ya es string, lo guardamos
                clean_sugerencias.append(str(s))
        
        result_dict["sugerencias"] = clean_sugerencias
        # ---------------------------
        
        return IAResponse(**result_dict)
        
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
                    "content": """
Eres un Copiloto BPMN experto. Recibes un JSON de jsPlumb y una orden del usuario.
Tu único objetivo es devolver el JSON modificado basándote en la orden.

REGLAS ESTRUCTURALES ESTRICTAS:
1. REGLA DE ELIMINACIÓN: Si el usuario pide eliminar un nodo (tarea, inicio, fin), DEBES BORRAR EL OBJETO COMPLETO del array "nodos". NUNCA lo renombres como "nodo eliminado" o "tarea vacía". Si borras un nodo, TAMBIÉN DEBES BORRAR del array "aristas" cualquier conexión que tuviera a ese nodo como 'fuente' o 'destino'.
2. REGLA ESPACIAL: Los nodos nuevos deben tener x > 180 y y > 50 para no tapar las cabeceras.
3. REGLA DE FORMATO: Devuelve ÚNICAMENTE un objeto JSON válido y limpio. NO uses caracteres de escape extraños en las claves (no uses \\"). NO incluyas formato Markdown (```json).
"""
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
