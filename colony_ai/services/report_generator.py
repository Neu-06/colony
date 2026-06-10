
import os
import pandas as pd
from pymongo import MongoClient
import base64
from io import BytesIO
from datetime import datetime

from reportlab.lib.pagesizes import letter, landscape
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle,
    Paragraph, Spacer, HRFlowable
)
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from docx import Document
from dotenv import load_dotenv

from .nlg_engine import NLGEngine


class ReportGenerator:

    def __init__(self):
        current_dir = os.path.dirname(os.path.abspath(__file__))
        env_path = os.path.join(current_dir, '..', '..', '.env')
        load_dotenv(env_path)

        mongo_uri = os.environ.get("SPRING_DATA_MONGODB_URI", "mongodb://localhost:27017/colony_db")
        self.client = MongoClient(mongo_uri, serverSelectionTimeoutMS=5000)
        self.db = self.client.get_database()

        self.nombres_reales: dict = {}
        self._cargar_nombres_reales()
        self.nlg = NLGEngine(self.nombres_reales)

    # ── Nombres reales ────────────────────────────────────────
    def _cargar_nombres_reales(self):
        """Carga el mapa nodo_id → etiqueta humana desde politicas_negocio."""
        try:
            for pol in self.db.politicas_negocio.find({}):
                for nodo in pol.get("nodos", []):
                    nid_1 = str(nodo.get("idNodo") or nodo.get("id") or nodo.get("_id") or "")
                    nid_2 = str(nodo.get("codigo") or "")
                    etiq  = (nodo.get("nombre") or nodo.get("etiqueta") or nodo.get("label") or nodo.get("name") or nodo.get("title") or "")
                    if etiq:
                        if nid_1: self.nombres_reales[nid_1] = etiq
                        if nid_2: self.nombres_reales[nid_2] = etiq
        except Exception as e:
            print(f"[ReportGen] No se pudieron cargar nombres de nodos: {e}")

    def _nombre(self, nodo_id: str) -> str:
        return self.nombres_reales.get(str(nodo_id), str(nodo_id))

    # ── Pipeline constructor ──────────────────────────────────
    def _build_pipeline(self, entities: dict) -> tuple:
        """Retorna (colección, pipeline_aggregation, tema_efectivo)."""
        tema       = entities.get("tema", "general")
        limite     = max(1, min(int(entities.get("limite", 100)), 5000))
        orden      = -1 if entities.get("orden", "desc") == "desc" else 1
        umbral     = float(entities.get("umbral_pct", 0.0))
        estado     = entities.get("estado")
        fecha      = entities.get("fecha")

        col  = "instancias"
        if tema == "cuellos":
            col = "historial"

        pipe = []
        if col == "instancias":
            if estado:
                pipe.append({"$match": {"estadoGeneral": estado}})
            if fecha:
                pipe.append({"$match": {"fechaInicio": {"$regex": f"^{fecha}"}}})

        if tema == "anomalias":
            # Soporte para umbral de riesgo detectado por TF (ej: "mayor al 90%")
            min_riesgo = max(umbral, 0.6)
            pipe.append({"$match": {
                "$or": [
                    {"anomaliaDetectada": True},
                    {"scoreRiesgo": {"$gte": min_riesgo}},
                    {"semaforo": "ROJO"},
                ]
            }})
            pipe.append({"$sort": {"scoreRiesgo": orden, "prioridadAnalitica": -1}})
            pipe.append({"$limit": limite})
            pipe.append({"$project": {
                "_id": 0,
                "Código":              "$codigo",
                "Nombre":              "$nombre",
                "Estado":              "$estadoGeneral",
                "Semáforo":            "$semaforo",
                "Riesgo (%)":          {"$round": [{"$multiply": ["$scoreRiesgo", 100]}, 1]},
                "Prioridad ML":        "$prioridadAnalitica",
                "Anomalía":            "$anomaliaDetectada",
                "Nodo Actual":         {"$arrayElemAt": ["$nodosActualesIds", 0]},
            }})

        elif tema == "cuellos":
            pipe.append({"$match": {
                "tiempoResolucionSegundos": {"$exists": True, "$gt": 0},
                "nodoDestino": {"$not": {"$regex": "^(join|fork|gateway|compuerta|start|end|evento|parallel|exclusive)", "$options": "i"}}
            }})
            pipe.append({"$group": {
                "_id":                    "$nodoDestino",
                "tiempoPromedioSegundos": {"$avg": "$tiempoResolucionSegundos"},
                "tiempoMaxSegundos":      {"$max": "$tiempoResolucionSegundos"},
                "tiempoMinSegundos":      {"$min": "$tiempoResolucionSegundos"},
                "cantidad":               {"$sum": 1},
            }})
            pipe.append({"$sort": {"tiempoPromedioSegundos": orden}})
            pipe.append({"$limit": limite})

        elif tema == "recientes":
            pipe.append({"$sort": {"fechaInicio": orden}})
            pipe.append({"$limit": limite})
            pipe.append({"$project": {
                "_id": 0,
                "Código":        "$codigo",
                "Nombre":        "$nombre",
                "Estado":        "$estadoGeneral",
                "Semáforo":      "$semaforo",
                "Riesgo (%)":    {"$round": [{"$multiply": ["$scoreRiesgo", 100]}, 1]},
                "Prioridad ML":  "$prioridadAnalitica",
                "Fecha Inicio":  "$fechaInicio",
            }})

        elif tema == "flujos":
            # Agrupar instancias por politicaId (Python resolverá el nombre en _sanitize de manera segura)
            pipe.append({"$group": {
                "_id":       "$politicaId",
                "total":     {"$sum": 1},
                "enProceso": {"$sum": {"$cond": [{"$eq": ["$estadoGeneral", "EN_PROCESO"]}, 1, 0]}},
                "riesgoAvg": {"$avg": "$scoreRiesgo"},
            }})
            pipe.append({"$sort": {"total": orden}})
            pipe.append({"$limit": limite})

        elif tema == "metricas":
            pipe.append({"$group": {
                "_id":            "$estadoGeneral",
                "cantidad":       {"$sum": 1},
                "riesgoPromedio": {"$avg": "$scoreRiesgo"},
                "riesgoMax":      {"$max": "$scoreRiesgo"},
            }})
            pipe.append({"$sort": {"cantidad": orden}})
            pipe.append({"$limit": limite})

        else:  # general
            pipe.append({"$sort": {"scoreRiesgo": orden}})
            pipe.append({"$limit": limite})
            pipe.append({"$project": {
                "_id": 0,
                "Código":       "$codigo",
                "Nombre":       "$nombre",
                "Estado":       "$estadoGeneral",
                "Semáforo":     "$semaforo",
                "Riesgo (%)":   {"$round": [{"$multiply": ["$scoreRiesgo", 100]}, 1]},
                "Prioridad ML": "$prioridadAnalitica",
                "Fecha Inicio": "$fechaInicio",
            }})

        return col, pipe, tema

    # ── Formateo de segundos ──────────────────────────────────
    @staticmethod
    def _fmt_seg(v) -> str:
        try:
            s = float(v)
            if s < 60:    return f"{s:.0f}s"
            if s < 3600:  return f"{s/60:.0f}min"
            if s < 86400: return f"{s/3600:.1f}h"
            return f"{s/86400:.1f}d"
        except Exception:
            return str(v)

    # ── Sanitización del DataFrame ────────────────────────────
    def _sanitize(self, df: pd.DataFrame, col_target: str, tema: str) -> pd.DataFrame:
        if col_target == "historial":
            # Traducir _id a nombre real y eliminar columna redundante
            df.insert(0, "Etapa del Flujo",
                      df["_id"].apply(lambda x: self._nombre(str(x))))
            df.drop(columns=["_id"], inplace=True, errors="ignore")

            # Formatear segundos
            for c in ["tiempoPromedioSegundos", "tiempoMaxSegundos", "tiempoMinSegundos"]:
                if c in df.columns:
                    df[c] = df[c].apply(self._fmt_seg)
            df.rename(columns={
                "tiempoPromedioSegundos": "Tiempo Promedio",
                "tiempoMaxSegundos":      "Tiempo Máximo",
                "tiempoMinSegundos":      "Tiempo Mínimo",
                "cantidad":               "Ejecuciones",
            }, inplace=True, errors="ignore")

        elif tema == "flujos":
            # La columna 'nombre_politica' viene del $lookup del pipeline
            if "nombre_politica" in df.columns:
                df.insert(0, "Flujo / Proceso", df["nombre_politica"])
                df.drop(columns=["nombre_politica", "_id"], inplace=True, errors="ignore")
            else:
                df.insert(0, "Flujo / Proceso",
                          df["_id"].apply(lambda x: self._get_politica_nombre(str(x))))
                df.drop(columns=["_id"], inplace=True, errors="ignore")
            if "riesgoAvg" in df.columns:
                df["Riesgo Promedio (%)"] = (df["riesgoAvg"].astype(float) * 100).round(1)
                df.drop(columns=["riesgoAvg"], inplace=True)
            df.rename(columns={
                "total":     "Total Trámites",
                "enProceso": "En Proceso",
            }, inplace=True, errors="ignore")

        elif tema == "anomalias" and "Nodo Actual" in df.columns:
            # Traducir el nodo actual a nombre legible
            df["Etapa Actual"] = df["Nodo Actual"].apply(
                lambda x: self._nombre(str(x)) if x else "—"
            )
            df.drop(columns=["Nodo Actual"], inplace=True, errors="ignore")

        # Tipos genéricos
        for col in df.columns:
            if pd.api.types.is_datetime64_any_dtype(df[col]):
                df[col] = df[col].dt.strftime("%Y-%m-%d %H:%M")
            else:
                df[col] = df[col].apply(
                    lambda x: (
                        x.strftime("%Y-%m-%d %H:%M") if isinstance(x, datetime)
                        else round(x, 2) if isinstance(x, float)
                        else str(x) if not isinstance(x, (int, str, bool, type(None)))
                        else x
                    )
                )
        return df

    def _get_politica_nombre(self, pol_id: str) -> str:
        try:
            from bson import ObjectId
            pol = self.db.politicas_negocio.find_one(
                {"_id": ObjectId(pol_id)}, {"nombre": 1}
            )
            if pol:
                return pol.get("nombre", pol_id)
        except Exception:
            pass
        return pol_id

    # ── API pública ───────────────────────────────────────────
    def generate_dynamic_report(self, req_message: str, entities: dict) -> dict:
        col_target, pipeline, tema = self._build_pipeline(entities)
        try:
            data = list(self.db.get_collection(col_target).aggregate(pipeline))
        except Exception as e:
            print(f"[ReportGen] Error MongoDB: {e}")
            data = []

        formato = entities.get("formato", "ninguno")
        
        # 1. Sanitizar y enriquecer los datos para que el LLM reciba nombres reales
        if not data:
            df = pd.DataFrame([{"Mensaje": "No se encontraron registros."}])
        else:
            df = pd.DataFrame(data)
            df = self._sanitize(df, col_target, tema)

        # 2. Generar resumen contextual vía RAG (pasando el mensaje del usuario)
        resumen_chat = self.nlg.generar(tema, df, req_message, col_target)

        if formato == "ninguno":
            return {"resumen_chat": resumen_chat, "archivo": None}

        # Generar archivo

        estado_val = entities.get("estado")
        if estado_val:
            titulo = f"Reporte_{estado_val.capitalize()}"
        elif tema != "general":
            titulo = f"Reporte_{tema.capitalize()}"
        else:
            titulo = "Reporte_Personalizado"

        if formato in ("excel", "xlsx"):
            archivo = self._to_excel(df, titulo)
        elif formato == "pdf":
            archivo = self._to_pdf(df, titulo)
        elif formato in ("word", "docx"):
            archivo = self._to_word(df, titulo)
        else:
            archivo = self._to_excel(df, titulo)

        return {
            "resumen_chat": resumen_chat + " Tu archivo está listo para descargar.",
            "archivo": archivo,
        }

    # ── Excel ─────────────────────────────────────────────────
    def _to_excel(self, df: pd.DataFrame, titulo: str) -> dict:
        buf = BytesIO()
        with pd.ExcelWriter(buf, engine="openpyxl") as writer:
            df.to_excel(writer, index=False, sheet_name=titulo[:31])
            ws = writer.sheets[titulo[:31]]
            for col_cells in ws.columns:
                max_len = max((len(str(c.value or "")) for c in col_cells), default=10)
                ws.column_dimensions[col_cells[0].column_letter].width = min(max_len + 4, 40)
        return {
            "filename": f"{titulo}.xlsx",
            "mime":     "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "data":     base64.b64encode(buf.getvalue()).decode(),
        }

    # ── PDF ───────────────────────────────────────────────────
    def _to_pdf(self, df: pd.DataFrame, titulo: str) -> dict:
        buf = BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=landscape(letter),
                                leftMargin=1*cm, rightMargin=1*cm,
                                topMargin=1.5*cm, bottomMargin=1*cm)
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            "T", parent=styles["Title"], fontSize=14,
            textColor=colors.HexColor("#1e293b"), spaceAfter=4)
        sub_style = ParagraphStyle(
            "S", parent=styles["Normal"], fontSize=9,
            textColor=colors.HexColor("#64748b"), spaceAfter=10)

        elements = [
            Paragraph(f"Colony BPMS — {titulo.replace('_', ' ')}", title_style),
            Paragraph(f"Generado: {datetime.now().strftime('%d/%m/%Y %H:%M')}", sub_style),
            HRFlowable(width="100%", thickness=1, color=colors.HexColor("#e2e8f0")),
            Spacer(1, 8),
        ]

        headers = df.columns.tolist()
        rows    = [[str(v)[:35] for v in row] for _, row in df.iterrows()]
        table_data = [headers] + rows

        # Ancho proporcional de columnas
        char_lens = [max(len(str(h)), max((len(str(r[i])) for r in rows), default=6))
                     for i, h in enumerate(headers)]
        total_chars = sum(char_lens) or 1
        avail = 24 * cm
        col_ws = [avail * (w / total_chars) for w in char_lens]

        t = Table(table_data, colWidths=col_ws, repeatRows=1)
        t.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, 0), colors.HexColor("#1e40af")),
            ("TEXTCOLOR",     (0, 0), (-1, 0), colors.white),
            ("FONTNAME",      (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE",      (0, 0), (-1, 0), 9),
            ("ALIGN",         (0, 0), (-1, -1), "CENTER"),
            ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
            ("ROWBACKGROUNDS",(0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
            ("FONTSIZE",      (0, 1), (-1, -1), 8),
            ("GRID",          (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("TOPPADDING",    (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("WORDWRAP",      (0, 0), (-1, -1), True),
        ]))
        elements.append(t)
        doc.build(elements)
        return {"filename": f"{titulo}.pdf", "mime": "application/pdf",
                "data": base64.b64encode(buf.getvalue()).decode()}

    # ── Word ──────────────────────────────────────────────────
    def _to_word(self, df: pd.DataFrame, titulo: str) -> dict:
        doc = Document()
        doc.add_heading(titulo.replace("_", " "), 0)
        doc.add_paragraph(f"Generado: {datetime.now().strftime('%d/%m/%Y %H:%M')}")
        doc.add_paragraph("")
        cols = df.columns.tolist()
        table = doc.add_table(rows=1, cols=len(cols))
        table.style = "Light Shading Accent 1"
        hdr = table.rows[0].cells
        for i, c in enumerate(cols):
            hdr[i].text = str(c)
            hdr[i].paragraphs[0].runs[0].bold = True
        for _, row in df.iterrows():
            cells = table.add_row().cells
            for i, val in enumerate(row):
                cells[i].text = str(val)[:50]
        buf = BytesIO()
        doc.save(buf)
        return {
            "filename": f"{titulo}.docx",
            "mime":     "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "data":     base64.b64encode(buf.getvalue()).decode(),
        }
