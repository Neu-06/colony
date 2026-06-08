"""
funcionario_ai.py - Copiloto IA exclusivo para funcionarios.
Separado completamente de canvas_ai.py.
Usa Gemini 2.5 Flash para procesamiento de lenguaje natural.
"""
import os
import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any, Dict, List, Optional
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

router = APIRouter(prefix="/api/v1/funcionario", tags=["Funcionario AI"])

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not GROQ_API_KEY:
    raise RuntimeError("GROQ_API_KEY no encontrada en .env")
groq_client = Groq(api_key=GROQ_API_KEY)
GROQ_FALLBACK_MODELS = [ "llama-3.3-70b-versatile","llama-3.1-8b-instant"]

# modelos pydantic

class CampoFormulario(BaseModel):
    nombre: str
    tipo: str
    requerido: bool
    opciones: Optional[str] = None

class TareaItem(BaseModel):
    instanciaId: str
    codigoTramite: str
    nombrePolitica: str
    nombreNodoActual: str
    fecha: Optional[str] = None
    semaforo: Optional[str] = None

class ComandoTareasRequest(BaseModel):
    """Para comandos sobre la bandeja (abrir tarea, cuál tiene más espera, etc.)"""
    comando: str
    tareas: List[TareaItem]

class ComandoFormularioRequest(BaseModel):
    """Para rellenar campos del formulario con voz/lenguaje natural."""
    comando: str
    esquemaFormulario: List[CampoFormulario]
    valoresActuales: Optional[Dict[str, Any]] = None

class ValidarEnvioRequest(BaseModel):
    """Valida si el formulario cumple requisitos antes de enviar."""
    esquemaFormulario: List[CampoFormulario]
    valoresActuales: Dict[str, Any]

# prompt

PROMPT_BANDEJA = """
Eres un asistente de oficina para funcionarios públicos. Tu rol es interpretar comandos de voz 
y texto para ayudar al funcionario a gestionar su bandeja de tareas pendientes.

CAPACIDADES:
- Identificar qué tarea abrir según criterios como "más antigua", "más urgente", "mayor tiempo de espera", "más reciente", "la de mayor prioridad", etc.
- Responder preguntas sobre cuántas tareas hay, cuáles están en rojo (urgentes), etc.

REGLAS:
- Siempre devuelve un JSON válido.
- Si el comando pide abrir una tarea específica, devuelve el instanciaId de la tarea que coincide.
- Si no hay coincidencia clara, devuelve null en instanciaId con un mensaje explicativo.
- El semáforo "ROJO" indica tarea nueva/urgente, "AMARILLO" indica en proceso.

FORMATO DE RESPUESTA OBLIGATORIO:
{
  "accion": "abrir_tarea" | "informar" | "sin_accion",
  "instanciaId": "id-si-aplica-o-null",
  "mensaje": "Mensaje claro y amigable para el funcionario",
  "datos_extra": {}
}
"""

PROMPT_FORMULARIO = """
Eres un asistente de voz para funcionarios públicos. Tu tarea es interpretar lo que dice 
el funcionario en lenguaje natural y convertirlo en valores concretos para llenar un formulario.

REGLAS ESTRICTAS:
1. Solo rellena campos que el formulario tiene definidos (usa exactamente los nombres del esquema).
2. Respeta los tipos de datos: número → número, fecha → formato ISO (YYYY-MM-DD), boolean → true/false, text → string.
3. Si el funcionario menciona un valor que aplica a un campo, asígnalo aunque use sinónimos (ej: "si" → true, "aprobado" para un campo Aprobado).
4. Si el funcionario menciona múltiples campos, rellena todos los que puedas interpretar.
5. No inventes campos que no existen en el esquema.
6. Para campos de tipo 'select', elige la opción más cercana del listado de opciones disponibles.

FORMATO DE RESPUESTA OBLIGATORIO:
{
  "camposRellenos": {
    "NombreCampoExacto": "valor_convertido"
  },
  "camposNoInterpretados": ["campo1"],
  "mensaje": "Mensaje amigable indicando qué se rellenó y qué faltó"
}
"""

PROMPT_VALIDACION = """
Eres un validador de formularios de trámites oficiales.

Tu tarea: analizar si un formulario está listo para ser enviado.

REGLAS:
1. Verifica que todos los campos con requerido=true tengan un valor no vacío.
2. Un campo boolean con valor false SÍ cuenta como completado.
3. Un campo con valor "" (string vacío) o null NO está completado.
4. Devuelve los nombres exactos de los campos requeridos que faltan.

FORMATO DE RESPUESTA:
{
  "puedeEnviar": true | false,
  "camposFaltantes": ["Campo1", "Campo2"],
  "mensaje": "Mensaje claro para el funcionario"
}
"""
# fallback de modelos
def generar_respuesta_json(prompt: str) -> dict:
    last_error: Exception | None = None
    
    for model in GROQ_FALLBACK_MODELS:
        try:
            response = groq_client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": "Responde SOLO con un JSON valido."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.2,
                response_format={"type": "json_object"}
            )
            return json.loads(response.choices[0].message.content)
        except Exception as e:
            last_error = e

    if last_error:
        raise last_error
    raise RuntimeError("No se pudo obtener respuesta del modelo")

# ENDPOINTS
@router.post("/comando-bandeja")
async def comando_bandeja(request: ComandoTareasRequest):
    """
    Interpreta un comando de voz/texto sobre la bandeja de tareas.
    Ejemplo: 'abre la tarea más antigua' → devuelve el instanciaId correspondiente.
    """
    try:
        tareas_json = json.dumps([t.model_dump() for t in request.tareas], ensure_ascii=False)
        prompt = f"""{PROMPT_BANDEJA}

BANDEJA DE TAREAS DEL FUNCIONARIO:
{tareas_json}

COMANDO DEL FUNCIONARIO: "{request.comando}"

Responde con el JSON de acción correspondiente."""

        resultado = generar_respuesta_json(prompt)
        print(f" Comando bandeja procesado: accion={resultado.get('accion')}")
        return resultado

    except Exception as e:
        error_text = str(e)
        print(f" ERROR en comando-bandeja: {error_text}")
        if "503" in error_text or "UNAVAILABLE" in error_text:
            return {
                "accion": "informar",
                "instanciaId": None,
                "mensaje": "La IA esta saturada, por favor intenta en 10 segundos",
                "datos_extra": {}
            }
        raise HTTPException(status_code=500, detail=f"Error procesando comando: {error_text}")


@router.post("/rellenar-formulario")
async def rellenar_formulario(request: ComandoFormularioRequest):
    """
    Interpreta un comando de voz/texto y lo mapea a campos del formulario activo.
    Ejemplo: 'el monto es 5000 y fue aprobado' → {"Monto": 5000, "Aprobado": true}
    """
    try:
        esquema_json = json.dumps([c.model_dump() for c in request.esquemaFormulario], ensure_ascii=False)
        actuales_json = json.dumps(request.valoresActuales or {}, ensure_ascii=False)

        prompt = f"""{PROMPT_FORMULARIO}

ESQUEMA DEL FORMULARIO (campos disponibles):
{esquema_json}

VALORES ACTUALES YA RELLENADOS (para contexto):
{actuales_json}

COMANDO/DICTADO DEL FUNCIONARIO: "{request.comando}"

Devuelve el JSON con los campos interpretados."""

        response = groq_client.chat.completions.create(
            model=GROQ_FALLBACK_MODELS[0],
            messages=[
                {"role": "system", "content": "Responde SOLO con un JSON valido."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.2,
            response_format={"type": "json_object"}
        )
        resultado = json.loads(response.choices[0].message.content)
        print(f"Formulario rellenado: {list(resultado.get('camposRellenos', {}).keys())}")
        return resultado

    except Exception as e:
        print(f"ERROR en rellenar-formulario: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error rellenando formulario: {str(e)}")


@router.post("/validar-envio")
async def validar_envio(request: ValidarEnvioRequest):
    """
    Valida si el formulario cumple todos los requisitos antes de enviar.
    Protege contra envíos con campos requeridos vacíos por comando de voz.
    """
    try:
        esquema_json = json.dumps([c.model_dump() for c in request.esquemaFormulario], ensure_ascii=False)
        valores_json = json.dumps(request.valoresActuales, ensure_ascii=False)

        prompt = f"""{PROMPT_VALIDACION}

ESQUEMA DEL FORMULARIO:
{esquema_json}

VALORES ACTUALES:
{valores_json}

Devuelve el JSON de validación."""

        response = groq_client.chat.completions.create(
            model=GROQ_FALLBACK_MODELS[0],
            messages=[
                {"role": "system", "content": "Responde SOLO con un JSON valido."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.2,
            response_format={"type": "json_object"}
        )
        resultado = json.loads(response.choices[0].message.content)
        print(f" Validación: puedeEnviar={resultado.get('puedeEnviar')}, faltantes={resultado.get('camposFaltantes', [])}")
        return resultado

    except Exception as e:
        print(f"ERROR en validar-envio: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error validando formulario: {str(e)}")
