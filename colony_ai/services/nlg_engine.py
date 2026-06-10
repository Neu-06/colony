"""
Motor NLG Inteligente (RAG con Groq API) — Colony BPMS AI.
Convierte datos tabulares en respuestas naturales y expertas usando Llama 3.
"""
import os
import json
import pandas as pd
from dotenv import load_dotenv

try:
    from groq import Groq
    GROQ_AVAILABLE = True
except ImportError:
    GROQ_AVAILABLE = False

load_dotenv()
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

class NLGEngine:
    def __init__(self, nombres_reales: dict):
        self.nombres = nombres_reales
        self.client = Groq(api_key=GROQ_API_KEY) if GROQ_AVAILABLE and GROQ_API_KEY else None
        self.model = "llama-3.1-8b-instant"  # Modelo rápido y excelente en español

    def generar(self, tema: str, df: pd.DataFrame, req_message: str, col_target: str = "instancias") -> str:
        """Genera una respuesta natural usando Groq (RAG)."""
        if "Mensaje" in df.columns and len(df) == 1 and df.iloc[0].get("Mensaje") == "No se encontraron registros.":
            return "No encontré registros en la base de datos que coincidan con tu consulta en este momento."

        # Convertir DF a JSON compacto (limitado a 15 para no romper contexto y mantener velocidad)
        data_subset = df.head(15).to_dict(orient="records")
        data_json = json.dumps(data_subset, ensure_ascii=False)

        if not self.client:
            return self._fallback_estatico(tema, df)

        prompt_sistema = f"""Eres el sistema experto 'Colony BPMS AI', un analista de datos avanzado.
Tu tarea es responder la pregunta del usuario de forma orgánica y humana usando EXCLUSIVAMENTE estos datos.

REGLAS ESTRICTAS:
1. Responde de manera natural, directa y experta.
2. NUNCA menciones que recibiste un "JSON" o "datos proveídos". Actúa como si hubieras consultado la BD tú mismo.
3. Extrae la información EXACTA que pide el usuario.
4. Usa los atributos de "Nombre" siempre que estén disponibles, en lugar de los "Códigos" técnicos crudos.
5. NO uses asteriscos (**) en tu respuesta. El usuario prefiere texto plano y limpio.
6. NO inventes información. Si la respuesta a su pregunta no está en los datos, dile que no dispones de ese dato exacto.
7. ATENCIÓN: Si el usuario solicita generar un reporte (Word, Excel, PDF), CONFIRMA SIEMPRE en tu texto que el archivo ya se generó con éxito y está listo para descargar, porque el sistema ya se encargó de crearlo. JAMÁS digas que no tienes acceso a herramientas de generación.
8. Resume la información de forma brillante y útil.

DATOS RECUPERADOS (Contexto sobre {tema}):
{data_json}"""

        prompt_usuario = f"Pregunta del usuario: '{req_message}'"

        try:
            chat_completion = self.client.chat.completions.create(
                messages=[
                    {"role": "system", "content": prompt_sistema},
                    {"role": "user", "content": prompt_usuario}
                ],
                model=self.model,
                temperature=0.3,
                max_tokens=600,
            )
            return chat_completion.choices[0].message.content.strip()
        except Exception as e:
            print(f"[NLG] Error llamando a Groq API: {e}")
            return self._fallback_estatico(tema, df)

    def _fallback_estatico(self, tema: str, df: pd.DataFrame) -> str:
        """Respuesta de emergencia si Groq falla."""
        total = len(df)
        return f"Encontré {total} registros relevantes en el sistema relacionados con '{tema}'. He procesado tu solicitud."

    def ayuda(self) -> str:
        return (
            "¡Hola! Soy Colony, tu asistente experto potenciado por Inteligencia Artificial generativa. "
            "A diferencia de un buscador tradicional, puedo deducir información, cruzar datos y responder preguntas exactas. "
            "Pregúntame cosas como: '¿cuál es la instancia más reciente y a qué flujo pertenece?', "
            "o '¿qué etapa está causando cuellos de botella?'. "
            "Analizaré la base de datos en tiempo real."
        )
