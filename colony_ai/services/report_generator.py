import os
import pandas as pd
from pymongo import MongoClient
import base64
from io import BytesIO

# Import pdf y word
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from docx import Document
from dotenv import load_dotenv

class ReportGenerator:
    def __init__(self):
        current_dir = os.path.dirname(os.path.abspath(__file__))
        env_path = os.path.join(current_dir, '..', '..', '.env')
        load_dotenv(env_path)
        
        mongo_uri = os.environ.get("SPRING_DATA_MONGODB_URI", "mongodb://localhost:27017/colony_db")
        self.client = MongoClient(mongo_uri)
        self.db = self.client.get_database() # Auto detects colony_db

    def generate_report(self, tema, formato):
        # 1. Extraer data
        df = self._fetch_data(tema)
        
        # 2. Generar archivo
        if formato == "excel":
            return self._to_excel(df, tema)
        elif formato == "pdf":
            return self._to_pdf(df, tema)
        elif formato == "word":
            return self._to_word(df, tema)
        else:
            return self._to_excel(df, tema) # fallback

    def _fetch_data(self, tema):
        if tema == "anomalias":
            # Extraer anomalias de instancias
            cursor = self.db.instancias.find({"$or": [{"anomaliaDetectada": True}, {"scoreRiesgo": {"$gte": 0.6}}]})
            data = []
            for doc in cursor:
                data.append({
                    "Codigo_Tramite": doc.get("codigo", "N/A"), 
                    "Estado": doc.get("estadoGeneral", "Desconocido"),
                    "Riesgo_%": round(doc.get("scoreRiesgo", 0) * 100, 2), 
                    "Nivel_Urgencia": doc.get("prioridadAnalitica", 1), 
                    "Es_Anomalia": "SI" if doc.get("anomaliaDetectada") else "NO",
                    "Fecha_Inicio": doc.get("fechaInicio")
                })
        elif tema == "cuellos":
            # Extraer cuellos de historial (simplificado)
            pipeline = [
                {"$group": {"_id": "$nodoDestino", "tiempoPromedio": {"$avg": "$tiempoResolucionSegundos"}, "cantidad": {"$sum": 1}}},
                {"$sort": {"tiempoPromedio": -1}},
                {"$limit": 20}
            ]
            cursor = self.db.historial.aggregate(pipeline)
            data = [{"NodoID": doc.get("_id"), "TiempoPromedio_Seg": doc.get("tiempoPromedio"), "Ejecuciones": doc.get("cantidad")} for doc in cursor]
        else:
            # Metricas generales (resumen de instancias)
            cursor = self.db.instancias.find().limit(500)
            data = []
            for doc in cursor:
                data.append({
                    "Codigo_Tramite": doc.get("codigo", "N/A"), 
                    "Estado": doc.get("estadoGeneral", "Desconocido"), 
                    "Riesgo_%": round(doc.get("scoreRiesgo", 0) * 100, 2),
                    "Fecha_Inicio": doc.get("fechaInicio"),
                    "Semaforo": doc.get("semaforo", "N/A")
                })
            
        if not data:
            data = [{"Mensaje": "No hay datos disponibles para este tema"}]
            
        return pd.DataFrame(data)

    def _to_excel(self, df, tema):
        output = BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name=tema.capitalize())
        b64 = base64.b64encode(output.getvalue()).decode('utf-8')
        return {"filename": f"Reporte_{tema.capitalize()}.xlsx", "mime": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "data": b64}

    def _to_pdf(self, df, tema):
        output = BytesIO()
        c = canvas.Canvas(output, pagesize=letter)
        c.drawString(100, 750, f"Reporte de {tema.capitalize()} - Colony BPMS")
        y = 720
        # Imprimir solo primeras filas para demostracion
        for idx, row in df.head(30).iterrows():
            text = " | ".join([f"{str(val)[:20]}" for val in row.values])
            c.drawString(50, y, text)
            y -= 20
            if y < 50:
                c.showPage()
                y = 750
        c.save()
        b64 = base64.b64encode(output.getvalue()).decode('utf-8')
        return {"filename": f"Reporte_{tema.capitalize()}.pdf", "mime": "application/pdf", "data": b64}

    def _to_word(self, df, tema):
        doc = Document()
        doc.add_heading(f"Reporte de {tema.capitalize()} - Colony BPMS", 0)
        
        table = doc.add_table(rows=1, cols=len(df.columns))
        hdr_cells = table.rows[0].cells
        for i, col in enumerate(df.columns):
            hdr_cells[i].text = str(col)
            
        for _, row in df.head(50).iterrows():
            row_cells = table.add_row().cells
            for i, val in enumerate(row):
                row_cells[i].text = str(val)
                
        output = BytesIO()
        doc.save(output)
        b64 = base64.b64encode(output.getvalue()).decode('utf-8')
        return {"filename": f"Reporte_{tema.capitalize()}.docx", "mime": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "data": b64}
