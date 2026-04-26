import os
import json
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Any, List
import uvicorn
from dotenv import load_dotenv

# Nueva librería de Google
from google import genai 

load_dotenv()

app = FastAPI(title="Colony AI Microservice")

# Validar llave
api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    raise RuntimeError("GEMINI_API_KEY no encontrada en el archivo .env")

# Inicializar nuevo cliente
client = genai.Client(api_key=api_key)

class CanvasData(BaseModel):
    data: Any

class IAResponse(BaseModel):
    faltaInicio: bool
    faltaFin: bool
    nodosSinConexion: List[str]
    sugerencias: List[str]

# Lista de modelos en cascada para fallback (Resiliencia ante errores 429)
AI_MODELS = ['gemini-2.5-flash']

@app.post("/api/v1/recommend", response_model=IAResponse)
async def recommend_flow(canvas: CanvasData):
    json_str = json.dumps(canvas.data)
    prompt = f"""
    Eres un analista experto en flujos de trabajo BPMN. 
    Analiza el siguiente JSON de un flujo.
    Responde ÚNICAMENTE con un JSON válido que cumpla exactamente esta estructura:
    {{"faltaInicio": bool, "faltaFin": bool, "nodosSinConexion": ["nodo_id"], "sugerencias": ["sug1", "sug2"]}}
    No incluyas markdown (como ```json) ni texto adicional. Solo el objeto JSON crudo.
    JSON a analizar:
    {json_str}
    """

    for model_name in AI_MODELS:
        try:
            print(f"Intentando análisis con modelo: {model_name}...")
            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
            )
            
            raw_text = response.text.strip()
            if raw_text.startswith("```json"):
                raw_text = raw_text[7:]
            if raw_text.endswith("```"):
                raw_text = raw_text[:-3]
                
            result_dict = json.loads(raw_text.strip())
            return IAResponse(**result_dict)

        except Exception as e:
            err_msg = str(e)
            if any(key in err_msg for key in ["429", "Quota", "Exhausted"]):
                print(f"⚠️ Modelo {model_name} saturado (429), intentando el siguiente...")
                continue
            raise HTTPException(status_code=500, detail=f"Error fatal en {model_name}: {err_msg}")

    raise HTTPException(status_code=429, detail="Todos los modelos de IA están saturados. Por favor, espera 30 segundos.")

@app.post("/api/v1/fix")
async def fix_flow(canvas: CanvasData):
    json_str = json.dumps(canvas.data)
    prompt = f"""
    Eres un reparador experto de JSON de jsPlumb para flujos BPMN. 
    Se te entrega un JSON que describe un flujo de trabajo. 
    Tu objetivo es devolver el MISMO JSON EXACTO, pero realizando las siguientes reparaciones si son necesarias:
    1. Si el flujo no tiene un nodo con tipo 'INICIO' (o 'START'), agrégalo a la lista de 'nodos'.
    2. Si el flujo no tiene un nodo con tipo 'FIN' (o 'END'), agrégalo a la lista de 'nodos'.
    
    REGLAS ESTRICTAS:
    - Los nuevos nodos deben tener coordenadas x: 100, y: 100.
    - NO modifiques IDs, aristas ni coordenadas de los nodos existentes.
    - Devuelve ÚNICAMENTE el JSON crudo reparado. 
    - No incluyas markdown (```json) ni explicaciones.
    
    JSON a reparar:
    {json_str}
    """

    for model_name in AI_MODELS:
        try:
            print(f"Intentando corrección con modelo: {model_name}...")
            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
            )
            
            raw_text = response.text.strip()
            if raw_text.startswith("```json"):
                raw_text = raw_text[7:]
            if raw_text.endswith("```"):
                raw_text = raw_text[:-3]
                
            return json.loads(raw_text.strip())

        except Exception as e:
            err_msg = str(e)
            if any(key in err_msg for key in ["429", "Quota", "Exhausted"]):
                print(f"⚠️ Modelo {model_name} saturado (429), intentando el siguiente...")
                continue
            raise HTTPException(status_code=500, detail=f"Error fatal en {model_name}: {err_msg}")

    raise HTTPException(status_code=429, detail="Todos los modelos de IA están saturados. Por favor, espera 30 segundos.")

if __name__ == "__main__":
    # Forzamos el puerto 8000 aquí para que Spring Boot lo encuentre
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)