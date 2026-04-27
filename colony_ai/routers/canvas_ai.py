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
                    "content": """Eres un Arquitecto de Software y Consultor de Negocios Senior.
Tu objetivo es diseñar flujos BPMN inteligentes, dinámicos y realistas basados en la petición del usuario.
NO eres una calculadora que dibuja líneas rectas; eres una IA que diseña procesos empresariales complejos con ramificaciones, toma de decisiones y múltiples roles.

REGLAS DE NEGOCIO (CREATIVIDAD OBLIGATORIA):
1. INVENTA PASOS LÓGICOS: Piensa como un experto. Si piden "proceso de compras", incluye pasos reales como "Generar Solicitud", "Evaluar Presupuesto" (Compuerta), "Aprobar", "Rechazar", "Notificar".
2. DEPARTAMENTOS: Crea los "carriles" que tengan sentido para el proceso (ej. "Empleado", "RRHH", "Gerencia").
3. COMPUERTAS Y RAMIFICACIONES: Usa OBLIGATORIAMENTE nodos de tipo "Compuerta" para dividir el flujo cuando haya decisiones.
4. FORMULARIOS HUMANOS: Si una "Tarea" requiere que alguien ingrese datos, añade campos lógicos al array "esquemaFormulario" (ej. {"nombre": "Monto", "tipo": "number"}). Si es una tarea automática o una compuerta, déjalo vacío: [].

REGLAS DE DISTRIBUCIÓN ESPACIAL (URBANISMO INTELIGENTE):
- El tiempo fluye hacia la derecha: Suma entre 200 y 300 a la "x" para avanzar al siguiente paso temporal.
- Usa el eje Y para Ramificaciones y Carriles: 
  * Si una "Compuerta" divide el camino, un camino sigue recto (misma "y"), y el otro camino debe ir más abajo (suma 200 a la "y") para que no choquen.
  * Ajusta la "y" base dependiendo del "carrilId" (Departamento) al que pertenezca la tarea.
- PROHIBIDO colocar dos nodos exactamente en las mismas coordenadas x,y.

ESTRUCTURA JSON ESTRICTA (PARA LA BASE DE DATOS):
- TODO elemento debe tener la clave "id" (en minúsculas, NUNCA "_id"). Inventa IDs únicos como "c-1", "n-1", "a-1".
- NODOS: Deben tener OBLIGATORIAMENTE las claves: "id", "nombre", "tipo" (Solo puede ser: Inicio, Tarea, Compuerta, Fin), "posicion": {"x": num, "y": num}, "carrilId" y "esquemaFormulario".
- ARISTAS: Deben tener: "id", "origenNodoId" y "destinoNodoId" enlazando los IDs correctos generados en los nodos.

Devuelve ÚNICAMENTE el objeto JSON final que contenga los arrays "carriles", "nodos" y "aristas". NO incluyas formato Markdown ni explicaciones.
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
