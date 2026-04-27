import os
import json
import uuid
import re
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any, List, Optional, Dict
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

router = APIRouter(prefix="/api/v1/canvas", tags=["Canvas AI"])

api_key = os.getenv("GROQ_API_KEY")
if not api_key:
    raise RuntimeError("GROQ_API_KEY no encontrada en el archivo .env")

client = Groq(api_key=api_key)

# Llama 3.3 70B: el modelo más capaz de Groq para razonamiento complejo
AI_MODEL = "llama-3.3-70b-versatile"

# ===========================================================================
# CONSTANTES DE DISEÑO ESPACIAL
# Usadas en el post-procesador para corregir coordenadas si la IA falla
# ===========================================================================
HEADER_WIDTH = 200       # Zona prohibida izquierda (cabeceras de carril)
LANE_HEIGHT   = 250      # Altura por carril
X_STEP        = 260      # Separación horizontal entre pasos del flujo
X_BRANCH_STEP = 240      # Separación para ramas en compuertas
Y_BRANCH_OFFSET = 220    # Desplazamiento vertical para ramas alternativas

# ===========================================================================
# MODELOS PYDANTIC
# ===========================================================================
class CanvasData(BaseModel):
    data: Any

class IAResponse(BaseModel):
    faltaInicio: bool
    faltaFin: bool
    nodosSinConexion: List[str]
    sugerencias: List[str]

class CanvasChatRequest(BaseModel):
    canvasJson: dict
    comando: str

# ===========================================================================
# PROMPT MAESTRO DE LA IA
# Este es el "cerebro" que guía a Llama para ser un experto BPMN completo
# ===========================================================================
SYSTEM_PROMPT_CHAT = """
Eres COLONY-AI, el Arquitecto Senior de Flujos de Trabajo y Experto en Diagramas de Actividades UML con Swimlanes (Carriles).
Trabajas para un software empresarial de gestión de políticas de negocio. Cuando el usuario te da una instrucción, la ejecutas con maestría y creatividad técnica.

═══════════════════════════════════════════════════════════════
VOCABULARIO DE TIPOS DE NODO (OBLIGATORIO USAR EXACTAMENTE ESTOS):
- "inicio"     → El único punto de entrada del proceso. Solo 1 por flujo.
- "tarea"      → Una actividad humana o automática. Puede tener formulario.
- "compuerta"  → Punto de decisión con múltiples caminos (Si/No, Aprobado/Rechazado).
- "fin"        → El punto final del proceso. Puede haber 1 o más (uno por cada camino terminal).
═══════════════════════════════════════════════════════════════

CAPACIDADES (TUS LIBERTADES ABSOLUTAS):
✅ CREAR: Generar flujos completos desde cero con carriles, nodos y conexiones.
✅ AGREGAR: Añadir nodos, carriles o aristas al flujo existente sin destruir lo que ya hay.
✅ ELIMINAR: Borrar nodos y automáticamente limpiar sus aristas huérfanas.
✅ MODIFICAR: Renombrar nodos, cambiar tipos, actualizar formularios, reubicar.
✅ CONECTAR: Crear aristas entre nodos existentes.
✅ REORGANIZAR: Redistribuir nodos para que no se sobrepongan.
✅ ANALIZAR: Detectar problemas estructurales y sugerir mejoras.

═══════════════════════════════════════════════════════════════
REGLAS DE DISEÑO DE FLUJOS DE NEGOCIO (CREATIVIDAD OBLIGATORIA):

1. PIENSA COMO CONSULTOR, NO COMO PROGRAMADOR:
   - Si te piden "proceso de vacaciones", NO hagas: Inicio → Solicitar → Fin.
   - HAZ: Inicio → Empleado envía solicitud (Tarea con formulario: fecha inicio, fecha fin, motivo) → Compuerta "¿Tiene días disponibles?" → [Sí] Notificar a RRHH → RRHH Revisa (Tarea) → Compuerta "¿Aprobado?" → [Aprobado] Confirmar al empleado (Tarea) → Fin | [Rechazado] Notificar rechazo → Fin | [No] Rechazar automáticamente → Fin.

2. CARRILES Y DEPARTAMENTOS:
   - Cada carril representa un actor o departamento del proceso.
   - Los nodos deben estar en el carril del responsable (ej: la tarea "Aprobar Crédito" está en el carril "Gerencia", no en "Cliente").
   - La "y" base de cada carril es: carril_index * 250 + 80.

3. FORMULARIOS EN TAREAS HUMANAS:
   - Toda tarea donde un humano ingrese información DEBE tener "esquemaFormulario" con campos relevantes.
   - Ejemplos de tipos: "text", "number", "date", "select", "textarea", "email", "boolean".
   - Ejemplo: [{"nombre": "Monto Solicitado", "tipo": "number"}, {"nombre": "Justificación", "tipo": "textarea"}]

4. COMPUERTAS INTELIGENTES:
   - Después de cada compuerta, al menos DOS aristas deben salir de ella con labels que indiquen la condición: "Aprobado", "Rechazado", "Si", "No", "> 1000", etc.
   - Una compuerta siempre debe tener un nodo de entrada y al menos dos de salida.

5. FLUJOS COMPLETOS Y COHERENTES:
   - SIEMPRE debe haber exactamente 1 nodo "inicio".
   - SIEMPRE debe haber al menos 1 nodo "fin" por cada camino terminal.
   - TODOS los nodos deben estar conectados (sin huérfanos).

═══════════════════════════════════════════════════════════════
REGLAS DE DISTRIBUCIÓN ESPACIAL (URBANISMO INTELIGENTE):

- ZONA PROHIBIDA: x < 200 (está ocupada por las cabeceras de los carriles). Mínimo x: 210.
- FLUJO HORIZONTAL: El tiempo avanza de izquierda a derecha. Cada paso suma entre 220 y 280 a la "x".
- CARRILES VERTICALES: La "y" base del carril 0 = 80, carril 1 = 330, carril 2 = 580, etc.
- RAMIFICACIONES: Cuando una compuerta divide el flujo:
  * El camino "positivo/principal" continúa en la misma "y" del carril.
  * El camino "negativo/alternativo" va a y + 200 dentro del mismo carril, o al carril siguiente.
- PROHIBICIÓN ABSOLUTA: Dos nodos NO pueden tener exactamente la misma (x, y).
- ESPACIADO MÍNIMO: Debe haber al menos 180px de diferencia en X entre dos nodos del mismo carril.

═══════════════════════════════════════════════════════════════
ESTRUCTURA JSON ESTRICTA (CONTRATO CON LA BASE DE DATOS):

CLAVES OBLIGATORIAS:
- Carriles: {"id": "lane-uuid", "nombre": "Nombre Departamento"}
- Nodos: {"id": "node-uuid", "nombre": "Nombre Tarea", "tipo": "tarea|inicio|compuerta|fin", "posicion": {"x": 300, "y": 80}, "carrilId": "lane-uuid", "esquemaFormulario": []}
- Aristas: {"id": "edge-uuid", "origenNodoId": "node-uuid", "destinoNodoId": "node-uuid", "etiqueta": "condicion_si_aplica"}

IDs ÚNICOS: Usa el formato "lane-N", "node-N", "edge-N" donde N es un número secuencial único (1, 2, 3...). NUNCA vacíos. NUNCA repetidos.

RESPUESTA: Devuelve ÚNICAMENTE el objeto JSON con las claves "carriles", "nodos" y "aristas". 
CERO texto adicional. CERO Markdown. CERO explicaciones fuera del JSON.
"""

SYSTEM_PROMPT_RECOMMEND = """
Eres COLONY-AI, analista experto en procesos BPMN y diseñador de diagramas de actividades UML.
Analiza el flujo recibido con ojo crítico de consultor de negocio.

Evalúa:
1. Estructura básica: ¿Tiene inicio y fin?
2. Conectividad: ¿Hay nodos huérfanos (sin conexiones)?
3. Lógica de negocio: ¿El flujo tiene sentido como proceso empresarial real?
4. Cobertura de casos: ¿Las compuertas tienen caminos para todos los escenarios?
5. Formularios: ¿Las tareas humanas tienen campos de formulario definidos?
6. Nomenclatura: ¿Los nombres son descriptivos y profesionales?

Responde ÚNICAMENTE con este JSON:
{
  "faltaInicio": false,
  "faltaFin": false,
  "nodosSinConexion": ["id-del-nodo-huerfano"],
  "sugerencias": ["Texto de sugerencia específica y accionable 1", "Sugerencia 2"]
}

Las "sugerencias" deben ser STRINGS PUROS (no objetos). Sé específico: en vez de "mejora el flujo", di "Agrega un nodo 'Notificar al cliente' después del nodo de aprobación para cerrar el ciclo".
"""

SYSTEM_PROMPT_FIX = """
Eres COLONY-AI, reparador automático de flujos BPMN. 
Recibe un JSON de flujo de trabajo y lo corrige automáticamente.

Correcciones que debes aplicar:
1. Si no hay nodo "inicio", agrega uno al principio del flujo (x:210, y:80).
2. Si no hay nodo "fin", agrega uno al final del último nodo conectado.
3. Si hay nodos sin ninguna arista (ni entrante ni saliente), conéctalos al flujo lógicamente.
4. Si una compuerta tiene solo una salida, agrega una segunda salida con condición "No / Rechazado" hacia un nodo "fin" o un nodo de notificación.
5. Corrige IDs vacíos: asigna "node-fix-N" donde N es incremental.
6. No cambies nodos que ya están correctos.

Devuelve ÚNICAMENTE el JSON completo corregido con "carriles", "nodos" y "aristas". Sin texto adicional.
"""

# ===========================================================================
# POST-PROCESADOR: Sanitizador de coordenadas y IDs
# Capa de seguridad por si la IA genera posiciones o IDs incorrectos
# ===========================================================================
def sanitizar_resultado(resultado: dict) -> dict:
    """
    Post-procesador completo:
    1. Traduce las claves que la IA genera al formato exacto que espera el frontend Angular.
       - nodos: 'id' → 'idNodo', normaliza posicion, tipo, etc.
       - aristas: mantiene origenNodoId/destinoNodoId
       - carriles: asegura 'id', 'nombre', 'orden'
    2. Garantiza IDs únicos y no vacíos
    3. Corrige posiciones que invaden la zona de cabeceras o se superponen
    4. Elimina aristas huérfanas
    """
    carriles_raw = resultado.get("carriles", [])
    nodos_raw    = resultado.get("nodos", [])
    aristas_raw  = resultado.get("aristas", [])

    # ─── 1. NORMALIZAR CARRILES ───────────────────────────────────────────────
    carriles = []
    lane_ids = set()
    for i, c in enumerate(carriles_raw):
        lane_id = str(c.get("id") or c.get("_id") or "").strip()
        if not lane_id or lane_id in lane_ids:
            lane_id = f"lane-{i+1}"
        lane_ids.add(lane_id)
        carriles.append({
            "id":     lane_id,
            "nombre": str(c.get("nombre") or f"Departamento {i+1}"),
            "orden":  int(c.get("orden", i + 1))
        })

    # Si la IA no generó carriles, crea uno por defecto
    if not carriles:
        carriles = [{"id": "lane-1", "nombre": "Principal", "orden": 1}]
        lane_ids = {"lane-1"}

    # ─── 2. NORMALIZAR NODOS ──────────────────────────────────────────────────
    ALTO_CARRIL = 250
    HEADER_X    = 160   # Mínimo X para no tapar cabeceras

    # Calcular canvas disponible: si hay muchos nodos distribuirlos dinámicamente
    total_nodos = max(len(nodos_raw), 1)
    # Ancho disponible por carril: distribuimos hasta 3200px
    canvas_ancho = min(max(total_nodos * 280, 900), 1100)

    node_ids = set()
    posiciones_usadas = set()
    nodos = []

    for i, n in enumerate(nodos_raw):
        # — ID del nodo —
        raw_id = str(n.get("idNodo") or n.get("id") or n.get("_id") or "").strip()
        if not raw_id or raw_id in node_ids:
            raw_id = f"node-ai-{i+1}"
        node_ids.add(raw_id)

        # — Tipo —
        tipo_raw = str(n.get("tipo", "tarea")).lower().strip()
        tipo_map = {
            "inicio": "inicio", "start": "inicio",
            "fin":    "fin",    "end":   "fin",
            "tarea":  "tarea",  "task":  "tarea", "actividad": "tarea",
            "compuerta": "compuerta", "gateway": "compuerta",
            "decision": "compuerta", "exclusivegateway": "compuerta",
        }
        tipo = tipo_map.get(tipo_raw, "tarea")

        # — Posición —
        pos = n.get("posicion") or {}
        x = int(float(pos.get("x", 0) or n.get("x", 0) or 0))
        y = int(float(pos.get("y", 0) or n.get("y", 0) or 0))

        # Garantizar X mínimo
        x = max(HEADER_X, x)

        # Si la posición está en (0,0) o ya usada, calcular automáticamente
        # Distribución inteligente: izquierda → derecha por orden de aparición
        # dentro del ancho disponible del canvas
        if x <= HEADER_X and y <= 0:
            # Asignación por defecto según orden
            col = i % max(int(canvas_ancho / 280), 1)
            row = i // max(int(canvas_ancho / 280), 1)
            x = HEADER_X + col * 270
            y = 80 + row * 230

        # Evitar superposición exacta
        while (x, y) in posiciones_usadas:
            x += 30
            y += 25
        posiciones_usadas.add((x, y))

        # — Carril —
        carril_id = str(n.get("carrilId") or n.get("carril_id") or "").strip()
        if not carril_id or carril_id not in lane_ids:
            # Asignar al primer carril disponible
            carril_id = carriles[0]["id"]

        # — Formulario —
        esquema_raw = n.get("esquemaFormulario") or n.get("esquema_formulario") or n.get("formulario") or []
        esquema = []
        for campo in esquema_raw:
            if isinstance(campo, dict):
                esquema.append({
                    "nombre":    str(campo.get("nombre") or campo.get("label") or "Campo"),
                    "tipo":      str(campo.get("tipo") or campo.get("type") or "text"),
                    "requerido": bool(campo.get("requerido") or campo.get("required") or False),
                    "opciones":  campo.get("opciones") or campo.get("options") or None
                })

        # — Nombre —
        nombre = str(n.get("nombre") or n.get("name") or n.get("label") or tipo.capitalize())

        # — Construir nodo en el formato exacto de Angular —
        nodo_normalizado = {
            "idNodo":          raw_id,
            "tipo":            tipo,
            "nombre":          nombre,
            "posicion":        {"x": x, "y": y},
            "carrilId":        carril_id,
            "esquemaFormulario": esquema,
            "dptoResponsable": str(n.get("dptoResponsable") or n.get("dpto") or "")
        }

        # Compuertas usan condicionLogica en vez de esquema
        if tipo == "compuerta":
            nodo_normalizado["condicionLogica"] = str(n.get("condicionLogica") or n.get("condicion") or "")

        nodos.append(nodo_normalizado)

    # ─── 3. NORMALIZAR ARISTAS ────────────────────────────────────────────────
    edge_ids = set()
    aristas = []
    for i, a in enumerate(aristas_raw):
        origen  = str(a.get("origenNodoId")  or a.get("origen")  or a.get("source") or a.get("from") or "").strip()
        destino = str(a.get("destinoNodoId") or a.get("destino") or a.get("target") or a.get("to")   or "").strip()

        # Eliminar aristas huérfanas
        if origen not in node_ids or destino not in node_ids:
            print(f"⚠️  Arista huérfana descartada: '{origen}' → '{destino}'")
            continue

        edge_id = str(a.get("id") or a.get("_id") or "").strip()
        if not edge_id or edge_id in edge_ids:
            edge_id = f"edge-ai-{i+1}"
        edge_ids.add(edge_id)

        arista = {
            "origenNodoId":  origen,
            "destinoNodoId": destino,
            "etiqueta":      str(a.get("etiqueta") or a.get("label") or a.get("condicion") or "").strip() or None,
            "condicion":     str(a.get("condicion") or a.get("condition") or "").strip() or None
        }
        aristas.append(arista)

    print(f"✅ Schema normalizado: {len(carriles)} carriles | {len(nodos)} nodos | {len(aristas)} aristas")
    return {"carriles": carriles, "nodos": nodos, "aristas": aristas}


# ===========================================================================
# ENDPOINTS
# ===========================================================================

@router.post("/recommend", response_model=IAResponse)
async def recommend_flow(canvas: CanvasData):
    """Analiza el flujo existente y devuelve sugerencias de mejora."""
    json_str = json.dumps(canvas.data, ensure_ascii=False)
    try:
        response = client.chat.completions.create(
            model=AI_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT_RECOMMEND},
                {"role": "user", "content": f"Analiza este flujo de trabajo y devuelve el JSON de diagnóstico:\n{json_str}"}
            ],
            response_format={"type": "json_object"},
            temperature=0.3  # Análisis requiere precisión
        )
        
        result_dict = json.loads(response.choices[0].message.content)
        
        # Blindar: asegurar que sugerencias sea lista de strings
        raw_sugerencias = result_dict.get("sugerencias", [])
        clean_sugerencias = []
        for s in raw_sugerencias:
            if isinstance(s, dict):
                valor = next(iter(s.values())) if s else ""
                clean_sugerencias.append(str(valor))
            else:
                clean_sugerencias.append(str(s))
        
        result_dict["sugerencias"] = clean_sugerencias
        return IAResponse(**result_dict)
        
    except Exception as e:
        print(f"🔥 ERROR EN RECOMMEND: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/fix")
async def fix_flow(canvas: CanvasData):
    """Corrige automáticamente errores estructurales del flujo."""
    json_str = json.dumps(canvas.data, ensure_ascii=False)
    try:
        response = client.chat.completions.create(
            model=AI_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT_FIX},
                {"role": "user", "content": f"Corrige este flujo de trabajo:\n{json_str}"}
            ],
            response_format={"type": "json_object"},
            temperature=0.2  # Corrección requiere máxima precisión
        )
        resultado = json.loads(response.choices[0].message.content)
        return sanitizar_resultado(resultado)
    except Exception as e:
        print(f"🔥 ERROR EN FIX: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/chat")
async def chat_canvas(request: CanvasChatRequest):
    """
    Endpoint principal del Copiloto IA.
    Recibe el JSON del canvas actual y un comando en lenguaje natural.
    Devuelve el canvas modificado.
    """
    try:
        json_str = json.dumps(request.canvasJson, ensure_ascii=False)
        
        # Construir contexto enriquecido para la IA
        num_nodos = len(request.canvasJson.get("nodos", []))
        num_carriles = len(request.canvasJson.get("carriles", []))
        canvas_vacio = num_nodos == 0
        
        if canvas_vacio:
            contexto_adicional = "\n\n⚠️ CONTEXTO: El canvas está VACÍO. Debes crear el flujo completo desde cero basándote en la orden del usuario."
        else:
            contexto_adicional = f"\n\n⚠️ CONTEXTO: El canvas YA TIENE {num_nodos} nodos en {num_carriles} carril(es). PRESERVA todo lo existente y aplica SOLO los cambios que el usuario pide."
        
        response = client.chat.completions.create(
            model=AI_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": SYSTEM_PROMPT_CHAT + contexto_adicional
                },
                {
                    "role": "user",
                    "content": f"INSTRUCCIÓN DEL USUARIO: {request.comando}\n\nJSON ACTUAL DEL CANVAS:\n{json_str}"
                }
            ],
            response_format={"type": "json_object"},
            temperature=0.6,  # Balance entre creatividad y precisión
            max_tokens=8000   # Flujos complejos pueden ser grandes
        )
        
        resultado_raw = json.loads(response.choices[0].message.content)
        
        # Aplicar post-procesador para garantizar integridad
        resultado_final = sanitizar_resultado(resultado_raw)
        
        print(f"✅ Chat IA procesado: {len(resultado_final.get('nodos', []))} nodos, {len(resultado_final.get('aristas', []))} aristas")
        return resultado_final
        
    except Exception as e:
        print(f"🔥 ERROR FATAL EN CHAT: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error en Copiloto IA: {str(e)}")
