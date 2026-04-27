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

#AI_MODEL = "llama-3.1-8b-instant"
AI_MODEL = "llama-3.3-70b-versatile"
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
                    "content": """Eres un Consultor de Negocios y Arquitecto BPMN Nivel Senior. 
El usuario te pedirá que diseñes un flujo de trabajo. Tu misión es devolver un JSON impecable y lógico.

REGLAS DE CREATIVIDAD (COMPÓRTATE COMO UN EXPERTO, NO COMO UN ROBOT):
1. PROCESOS REALES: Los procesos reales no son una línea recta. Usa condiciones, aprobaciones, rechazos.
2. TIPOS DE NODOS PERMITIDOS: Usa "Inicio", "Tarea", "Compuerta" (para decisiones) y "Fin".
3. FORMULARIOS: Si una "Tarea" requiere que un humano ingrese datos (ej. "Llenar Solicitud", "Evaluar Crédito"), DEBES agregar campos al array 'esquemaFormulario'. 
   - Ejemplo: "esquemaFormulario": [{"nombre": "Monto", "tipo": "number"}, {"nombre": "Motivo", "tipo": "text"}]
   - Si es una tarea automática, déjalo vacío: [].

REGLAS DE ESTRUCTURA JSON (CRÍTICAS PARA EL FRONTEND):
- La clave identificadora de TODOS los elementos debe ser "id" (con i minúscula, NUNCA "_id"). NUNCA uses "undefined".
- CARRILES: {"id": "c-1", "nombre": "Ventas", "orden": 1}
- NODOS: {"id": "n-1", "nombre": "...", "tipo": "...", "posicion": {"x": 100, "y": 100}, "carrilId": "c-1", "esquemaFormulario": [...]}
- ARISTAS: {"id": "a-1", "origenNodoId": "n-1", "destinoNodoId": "n-2"}

REGLAS DEL PATIO DE JUEGOS (DISTRIBUCIÓN ESPACIAL INTELIGENTE):
- Distribuye el diagrama como un humano: De izquierda a derecha.
- Avanza en el eje X: Inicio en x: 100. Siguiente paso en x: 350. Siguiente en x: 600.
- Ramificaciones (Uso del eje Y): Si pones una "Compuerta" en x: 600, y: 100, la ruta de "Aprobado" debe ir a x: 850, y: 100. La ruta de "Rechazado" debe ir hacia abajo, a x: 850, y: 300. ¡NO apiles nodos!
- Carriles: Si un nodo cruza a otro departamento (ej. de Ventas a Finanzas), asígnale el "carrilId" correspondiente y ajusta su "y" para que caiga visualmente dentro de ese carril.

Devuelve ÚNICAMENTE el JSON crudo con "carriles", "nodos" y "aristas".
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
