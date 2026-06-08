
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
GROQ_FALLBACK_MODELS = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]


class CampoFormulario(BaseModel):
    nombre: str
    tipo: str = "text"
    requerido: bool = True
    opciones: Optional[str] = None


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


def _build_checklist(campos: List[Dict[str, Any]], datos: Dict[str, Any]) -> tuple[List[str], List[str]]:
    """Devuelve (completados, faltantes) con los nombres de los campos."""
    completados = []
    faltantes = []
    for campo in campos:
        nombre = campo.get("nombre", "")
        requerido = campo.get("requerido", True)
        if nombre in datos and datos[nombre] not in (None, "", "null"):
            completados.append(nombre)
        elif requerido:
            faltantes.append(nombre)
    return completados, faltantes


def _get_campo_actual(campos: List[Dict[str, Any]], datos: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Devuelve el primer campo requerido que aún falta."""
    for campo in campos:
        nombre = campo.get("nombre", "")
        requerido = campo.get("requerido", True)
        if requerido and (nombre not in datos or datos[nombre] in (None, "", "null")):
            return campo
    return None


def generar_respuesta_json(prompt: str) -> dict:
    last_error: Exception | None = None

    for model in GROQ_FALLBACK_MODELS:
        try:
            response = groq_client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": "Eres un asistente que SOLO responde con JSON válido. Nunca incluyas texto fuera del JSON."},
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
    raise RuntimeError("No se pudo obtener respuesta del modelo de IA")


@router.post("/analizar-intencion")
async def analizar_intencion(request: AnalizarIntencionRequest):

    try:
        datos_acumulados = request.datosAcumulados or {}
        flujos = request.flujos

        # 1. Detectar el flujo activo de los datos acumulados o del historial
        flujo_activo_id: Optional[str] = datos_acumulados.get("__flujoId__")
        flujo_activo: Optional[FlujoDisponible] = None

        if flujo_activo_id:
            flujo_activo = next((f for f in flujos if f.flujoId == flujo_activo_id), None)

        # 2. Construir contexto de flujos para la IA
        flujos_resumen = "\n".join(
            f"- ID: {f.flujoId} | Nombre: {f.nombre} | Descripción: {f.descripcion or f.nombre}"
            for f in flujos
        )

        historial_texto = ""
        if request.historialChat:
            historial_texto = "\nHISTORIAL DE LA CONVERSACIÓN (últimos 6 turnos):\n"
            for msg in request.historialChat[-6:]:
                rol = "Cliente" if msg.get("rol") == "cliente" else "Agente"
                historial_texto += f"{rol}: {msg.get('texto', '')}\n"

        # 3. Si ya hay un flujo detectado, trabajar en modo recolección determinista
        if flujo_activo:
            campos = flujo_activo.camposRequeridos
            completados, faltantes = _build_checklist(campos, datos_acumulados)
            campo_obj = _get_campo_actual(campos, datos_acumulados)

            # Checklist explícito para la IA
            checklist_str = "ESTADO ACTUAL DEL FORMULARIO:\n"
            for campo_info in campos:
                nombre = campo_info.get("nombre", "")
                if nombre in datos_acumulados and datos_acumulados[nombre] not in (None, "", "null"):
                    checklist_str += f"  ✅ {nombre}: {datos_acumulados[nombre]}\n"
                elif campo_info.get("requerido", True):
                    checklist_str += f"  ❌ {nombre}: PENDIENTE (requerido)\n"
                else:
                    checklist_str += f"  ⬜ {nombre}: PENDIENTE (opcional)\n"

            campos_requeridos_total = [c for c in campos if c.get("requerido", True)]

            if not campos_requeridos_total:
                # El flujo no tiene campos requeridos definidos → no instanciar, pedir al admin
                print(f" ADVERTENCIA: flujo={flujo_activo_id} no tiene campos requeridos definidos")
                return {
                    "flujoDetectado": flujo_activo_id,
                    "flujoNombre": flujo_activo.nombre,
                    "datosExtraidos": {},
                    "datosFaltantes": [],
                    "campoActual": None,
                    "preguntaSugerida": None,
                    "instanciarAhora": False,
                    "mensajeAgente": "Este trámite no requiere datos adicionales. ¿Confirmas que deseas iniciarlo?",
                    "confianza": "media"
                }

            if not faltantes:
                # Todos los datos requeridos están completos → crear instancia
                print(f" Todos los datos completos para flujo={flujo_activo_id}. instanciar=True")
                return {
                    "flujoDetectado": flujo_activo_id,
                    "flujoNombre": flujo_activo.nombre,
                    "datosExtraidos": {},
                    "datosFaltantes": [],
                    "campoActual": None,
                    "preguntaSugerida": None,
                    "instanciarAhora": True,
                    "mensajeAgente": "¡Perfecto! Tengo todos los datos necesarios. Voy a crear tu trámite ahora mismo. 🚀",
                    "confianza": "alta"
                }

            campo_nombre = campo_obj.get("nombre") if campo_obj else None
            campo_tipo = campo_obj.get("tipo", "text") if campo_obj else "text"
            campo_opciones = campo_obj.get("opciones") if campo_obj else None

            opciones_str = f"\nOpciones disponibles: {campo_opciones}" if campo_opciones else ""
            tipo_instruccion = ""
            if campo_tipo == "archivo":
                tipo_instruccion = "Es un campo de tipo ARCHIVO. Si el usuario dice 'He adjuntado el archivo: [nombre]', extrae ese nombre como valor del campo."
            elif campo_tipo == "fecha":
                tipo_instruccion = "Es un campo de tipo FECHA. Acepta fechas en formato YYYY-MM-DD o expresiones relativas y conviértelas."
            elif campo_tipo == "select":
                tipo_instruccion = f"Es un campo de selección. Acepta solo una de las opciones disponibles: {campo_opciones}"

            prompt = f"""Estás recolectando datos para iniciar un trámite llamado "{flujo_activo.nombre}".
Eres el asistente virtual "Colony". Debes ser muy amable, natural, empático y conversacional. NUNCA suenes robótico (no uses frases como "nombre requerido" o "dato faltante").

{checklist_str}
{historial_texto}
CAMPO QUE DEBES RECOLECTAR AHORA: "{campo_nombre}" (tipo: {campo_tipo}){opciones_str}
{tipo_instruccion}

MENSAJE DEL CLIENTE: "{request.mensaje}"

INSTRUCCIÓN:
1. Analiza si el mensaje del cliente contiene el valor para el campo "{campo_nombre}".
2. Si lo contiene, extráelo en "datosExtraidos" con la clave exacta "{campo_nombre}".
3. Si el cliente indica que se equivocó, quiere CANCELAR el trámite, o cambiar a otro distinto, establece "flujoDetectado": "CANCELAR".
4. Si NO contiene el valor, o hizo una pregunta, responde su duda amablemente y pide el campo de nuevo de forma conversacional.
5. NO pidas campos que ya están marcados con ✅.
6. Calcula "datosFaltantes" basado en las ❌, EXCLUYENDO "{campo_nombre}" si lo lograste extraer.
7. Tu 'mensajeAgente' DEBE ser súper humano y claro. Si pides un archivo, explica que puede subirlo tocando el botón del clip 📎.

Responde con este JSON exacto:
{{
  "flujoDetectado": "{flujo_activo_id}",
  "flujoNombre": "{flujo_activo.nombre}",
  "datosExtraidos": {{}},
  "datosFaltantes": {json.dumps(faltantes)},
  "campoActual": "{campo_nombre}",
  "preguntaSugerida": "pregunta para el campo {campo_nombre}",
  "instanciarAhora": false,
  "mensajeAgente": "respuesta al cliente",
  "confianza": "alta"
}}"""

            resultado = generar_respuesta_json(prompt)

            if resultado.get("flujoDetectado") == "CANCELAR":
                return {
                    "flujoDetectado": "CANCELAR",
                    "flujoNombre": None,
                    "datosExtraidos": {"__flujoId__": None},
                    "datosFaltantes": [],
                    "campoActual": None,
                    "instanciarAhora": False,
                    "mensajeAgente": resultado.get("mensajeAgente", "Entendido, he cancelado el trámite actual. ¿En qué más te puedo ayudar?"),
                    "confianza": "alta"
                }

            # Validación determinista: recalcular instanciarAhora con los datos fusionados
            datos_fusionados = {**datos_acumulados, **resultado.get("datosExtraidos", {})}
            datos_fusionados["__flujoId__"] = flujo_activo_id
            _, faltantes_post = _build_checklist(campos, datos_fusionados)

            if not faltantes_post:
                resultado["instanciarAhora"] = True
                resultado["datosFaltantes"] = []
                resultado["campoActual"] = None
                resultado["mensajeAgente"] = resultado.get("mensajeAgente", "") + \
                    " ¡Excelente! Ya tengo todos los datos. Voy a crear tu trámite ahora. 🚀"
            else:
                resultado["instanciarAhora"] = False
                resultado["datosFaltantes"] = faltantes_post
                prox_campo = _get_campo_actual(campos, datos_fusionados)
                resultado["campoActual"] = prox_campo.get("nombre") if prox_campo else None

            print(f" flujo={flujo_activo_id}, campo={resultado.get('campoActual')}, "
                  f"faltantes={resultado.get('datosFaltantes')}, instanciar={resultado.get('instanciarAhora')}")
            return resultado

        else:
            # 4. Modo detección de flujo: preguntar al cliente qué necesita
            prompt = f"""Eres el asistente de Colony. Tu tarea es identificar qué trámite quiere iniciar el cliente.
Debes ser muy amable, natural, empático y conversacional. NUNCA suenes robótico.

FLUJOS DISPONIBLES:
{flujos_resumen}
{historial_texto}
MENSAJE DEL CLIENTE: "{request.mensaje}"

INSTRUCCIÓN:
1. Si el cliente claramente indica un trámite de la lista, devuelve su flujoId en "flujoDetectado".
2. Si no queda claro o solo está saludando, responde saludando de vuelta de forma amigable y describiéndole brevemente las opciones de trámites.
3. Tu 'mensajeAgente' DEBE ser siempre conversacional y humano.

Responde con este JSON exacto:
{{
  "flujoDetectado": "id-del-flujo-o-null",
  "flujoNombre": "nombre-del-flujo-o-null",
  "datosExtraidos": {{}},
  "datosFaltantes": [],
  "campoActual": null,
  "preguntaSugerida": null,
  "instanciarAhora": false,
  "mensajeAgente": "respuesta amigable al cliente",
  "confianza": "alta"
}}"""

            resultado = generar_respuesta_json(prompt)

            # SIEMPRE forzar instanciarAhora=False en modo detección.
            # La instancia NUNCA se crea en el mismo turno que se detecta el flujo.
            resultado["instanciarAhora"] = False

            if resultado.get("flujoDetectado"):
                # Inyectar el flujoId en datosExtraidos para que el backend lo preserve
                resultado.setdefault("datosExtraidos", {})
                resultado["datosExtraidos"]["__flujoId__"] = resultado["flujoDetectado"]

                flujo_sel = next((f for f in flujos if f.flujoId == resultado["flujoDetectado"]), None)
                if flujo_sel and flujo_sel.camposRequeridos:
                    campos_req = [c for c in flujo_sel.camposRequeridos if c.get("requerido", True)]
                    if campos_req:
                        primer_campo = campos_req[0]
                        resultado["campoActual"] = primer_campo.get("nombre")
                        resultado["datosFaltantes"] = [c.get("nombre") for c in campos_req]
                        # Agregar al mensaje que empiece a pedir el primer dato
                        primer_nombre = primer_campo.get("nombre", "el dato")
                        primer_tipo = primer_campo.get("tipo", "text")
                        if primer_tipo == "archivo":
                            resultado["mensajeAgente"] = resultado.get("mensajeAgente", "") + \
                                f" Para comenzar, necesito que adjuntes: {primer_nombre}. Usa el botón del clip 📎."
                        else:
                            resultado["mensajeAgente"] = resultado.get("mensajeAgente", "") + \
                                f" Para comenzar, ¿me puedes indicar {primer_nombre}?"
                    else:
                        resultado["campoActual"] = None
                        resultado["datosFaltantes"] = []

            print(f" Flujo detectado: {resultado.get('flujoDetectado')}, campo={resultado.get('campoActual')}, instanciar={resultado.get('instanciarAhora')}")
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
