from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from routers import canvas_ai

app = FastAPI(title="Colony AI Microservice")

# Configurar CORS para comunicación con el Frontend (Angular)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Incluir Routers Modulares
app.include_router(canvas_ai.router)

@app.get("/")
async def root():
    return {"status": "online", "message": "Colony AI API is running"}

if __name__ == "__main__":
    # Puerto 8000 para ser consumido por el Core y el Web
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)