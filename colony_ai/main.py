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

@app.post("/api/v1/recommend", response_model=IAResponse)
async def recommend_flow(canvas: CanvasData):
    try:
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

        # Nueva forma de llamar a Gemini (Usamos 1.5 Flash que es hiper rápido)
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
        )
        
        # Limpiar respuesta por si Gemini manda markdown
        raw_text = response.text.strip()
        if raw_text.startswith("```json"):
            raw_text = raw_text[7:]
        if raw_text.endswith("```"):
            raw_text = raw_text[:-3]
            
        result_dict = json.loads(raw_text.strip())
        return IAResponse(**result_dict)

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    # Forzamos el puerto 8000 aquí para que Spring Boot lo encuentre
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)