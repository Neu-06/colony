import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from routers import canvas_ai, funcionario_ai, cliente_ai, prediccion_ai, nlu_chat_router

app = FastAPI(title="Colony AI Microservice")

# Configurar CORS para el frontend de desarrollo
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200", "http://10.0.2.2:8080"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Incluir Routers Modulares
app.include_router(canvas_ai.router)
app.include_router(funcionario_ai.router)
app.include_router(cliente_ai.router)
app.include_router(prediccion_ai.router)
app.include_router(nlu_chat_router.router)

@app.get("/")
async def root():
    return {"status": "online", "message": "Colony AI API is running"}

if __name__ == "__main__":
    # Puerto 8000 para ser consumido por el Core y el Web
    uvicorn.run(
        "main:app",
        host=os.getenv("FASTAPI_HOST", "0.0.0.0"),
        port=int(os.getenv("FASTAPI_PORT", "8000")),
        reload=True,
    )