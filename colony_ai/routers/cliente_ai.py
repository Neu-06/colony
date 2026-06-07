
import os
import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any, Dict, List, Optional
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

router = APIRouter(prefix="/api/v1/cliente", tags=["Cliente AI"])

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not GROQ_API_KEY:
    raise RuntimeError("GROQ_API_KEY no encontrada en .env")
groq_client = Groq(api_key=GROQ_API_KEY)
GROQ_FALLBACK_MODELS = ["llama-3.1-8b-instant", "llama-3.3-70b-versatile"]


class FlujoDisponible(BaseModel):
    flujoId: str
    nombre: str
    descripcion: Optional[str] = None
    camposRequeridos: List[Dict[str, Any]] = []

class AnalizarIntencionRequest(BaseModel):
    mensaje: str
    historialChat: Optional[List[Dict[str, str]]] = []
    flujos: List[FlujoDisponible]
    datosAcumulados: Optional[Dict[str, Any]] = {}


PROMPT_AGENTE = """
Eres un agente de atención al cliente para una plataforma de gestión de trámites gubernamentales llamada Colony.
Tu rol es ayudar a los ciudadanos a iniciar trámites a través de una conversación natural y amigable en español.

CAPACIDADES:
1. Detectar qué tipo de trámite desea iniciar el cliente según los flujos disponibles.
2. Extraer datos relevantes del mensaje del cliente (nombres, fechas, números, etc.).
3. Identificar qué datos faltan y formular preguntas claras y amigables para obtenerlos.
4. Cuando todos los datos requeridos están completos, indicar que se puede iniciar el trámite.

REGLAS ESTRICTAS:
- Si el mensaje no corresponde a ningún flujo disponible, indica que no puedes ayudar con eso.
- Extrae SOLO datos que el cliente mencionó explícitamente. No inventes valores.
- Para campos de tipo "fecha", convierte expresiones como "mañana", "la próxima semana" a formato ISO YYYY-MM-DD si es posible, sino pide la fecha exacta.
- Para campos de tipo "select", elige la opción más cercana del listado disponible.
- Sé breve, amigable y claro. No uses lenguaje técnico.
- El campo "instanciarAhora" solo es true cuando TODOS los campos requeridos tienen valor.

FORMATO DE RESPUESTA OBLIGATORIO (JSON):
{
  "flujoDetectado": "id-del-flujo-o-null",
  "flujoNombre": "Nombre del flujo o null",
  "datosExtraidos": {
    "NombreCampo": "valor_extraido"
  },
  "datosFaltantes": ["NombreCampo1", "NombreCampo2"],
  "preguntaSugerida": "Pregunta amigable para obtener el siguiente dato faltante, o null si todo está completo",
  "instanciarAhora": true | false,
  "mensajeAgente": "Mensaje conversacional y amigable para el cliente",
  "confianza": "alta" | "media" | "baja"
}
"""


def generar_respuesta_json(prompt: str) -> dict:
    last_error: Exception | None = None

    for model in GROQ_FALLBACK_MODELS:
        try:
            response = groq_client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": "Responde SOLO con un JSON válido sin explicaciones adicionales."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1,
                response_format={"type": "json_object"}
            )
            return json.loads(response.choices[0].message.content)
        except Exception as e:
            last_error = e

    if last_error:
        raise last_error
    raise RuntimeError("No se pudo obtener respuesta del modelo de IA")


@router.post("/analizar-intencion")
async def analizar_intencion(request: AnalizarIntencionRequest):

    try:
        flujos_json = json.dumps(
            [f.model_dump() for f in request.flujos],
            ensure_ascii=False, indent=2
        )
        datos_acumulados_json = json.dumps(
            request.datosAcumulados or {},
            ensure_ascii=False
        )
        historial_texto = ""
        if request.historialChat:
            historial_texto = "\nHISTORIAL DE LA CONVERSACIÓN:\n"
            for msg in request.historialChat[-6:]:
                rol = "Cliente" if msg.get("rol") == "cliente" else "Agente"
                historial_texto += f"{rol}: {msg.get('texto', '')}\n"

        prompt = f"""{PROMPT_AGENTE}

FLUJOS DISPONIBLES EN EL SISTEMA:
{flujos_json}

DATOS YA RECOPILADOS EN ESTA SESIÓN:
{datos_acumulados_json}
{historial_texto}
MENSAJE ACTUAL DEL CLIENTE: "{request.mensaje}"

Analiza el mensaje y los datos acumulados, luego devuelve el JSON de respuesta."""

        resultado = generar_respuesta_json(prompt)
        print(f" Intención analizada: flujo={resultado.get('flujoDetectado')}, "
              f"instanciar={resultado.get('instanciarAhora')}, "
              f"faltantes={resultado.get('datosFaltantes', [])}")
        return resultado

    except Exception as e:
        error_text = str(e)
        print(f" ERROR en analizar-intencion: {error_text}")
        if "503" in error_text or "UNAVAILABLE" in error_text or "429" in error_text:
            return {
                "flujoDetectado": None,
                "flujoNombre": None,
                "datosExtraidos": {},
                "datosFaltantes": [],
                "preguntaSugerida": None,
                "instanciarAhora": False,
                "mensajeAgente": "Estoy teniendo dificultades técnicas en este momento. Por favor intenta en unos segundos.",
                "confianza": "baja"
            }
        raise HTTPException(status_code=500, detail=f"Error procesando mensaje: {error_text}")
