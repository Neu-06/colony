"""
Motor NLU (Natural Language Understanding) — Colony BPMS AI.
Arquitectura: Bidirectional LSTM Multi-Output, Keras Functional API.

Predice simultáneamente:
  - Intención : GENERAR_REPORTE | CONSULTA_ESTADO | AYUDA
  - Tema      : anomalias | cuellos | metricas | recientes | flujos | general
  - Límite    : 5 | 10 | 20 | 50 | 100 | ALL(0)
  - Orden     : asc | desc

Post-procesamiento heurístico robusto garantiza que nunca se pierda el contexto.
"""
import re
import random
import numpy as np

try:
    import tensorflow as tf
    from tensorflow.keras.models import Model
    from tensorflow.keras.layers import (
        Input, TextVectorization, Embedding,
        Bidirectional, LSTM, GlobalAveragePooling1D,
        Dense, Dropout, BatchNormalization
    )
    TF_AVAILABLE = True
except ImportError:
    TF_AVAILABLE = False
    print("Warning: TensorFlow no instalado. NLU correrá en modo heurístico.")


# Vocabularios de salida

INTENT_LABELS = ["GENERAR_REPORTE", "CONSULTA_ESTADO", "AYUDA"]
TEMA_LABELS   = ["anomalias", "cuellos", "metricas", "recientes", "flujos", "general"]
LIMITE_VALUES = [5, 10, 20, 50, 100, 0]   # 0 = ALL
ORDEN_LABELS  = ["asc", "desc"]


# Corpus de entrenamiento
# Formato: (texto, intent_idx, tema_idx, limite_idx, orden_idx)
# tema_idx: 0=anomalias,1=cuellos,2=metricas,3=recientes,4=flujos,5=general

_CORPUS = [
    # ── GENERAR_REPORTE + anomalias ──────────────────────────────────
    ("dame un pdf de las 5 anomalias mas graves",                     0, 0, 0, 1),
    ("genera excel con las 10 instancias mas riesgosas",              0, 0, 1, 1),
    ("exportar en word las anomalias detectadas",                     0, 0, 5, 1),
    ("necesito un reporte pdf de los riesgos altos",                  0, 0, 5, 1),
    ("hazme un excel de los 20 tramites con anomalia",                0, 0, 2, 1),
    ("quiero descargar un informe de riesgos en excel",               0, 0, 5, 1),
    ("generar reporte de riesgos criticos en pdf",                    0, 0, 5, 1),
    ("informe word de anomalias",                                     0, 0, 5, 1),
    ("dame un excel con los tramites en rojo",                        0, 0, 5, 1),
    ("reporte pdf anomalias 50 registros",                            0, 0, 3, 1),
    ("exporta en excel los 100 tramites mas criticos",                0, 0, 4, 1),
    ("reporte pdf de las ultimas tareas con anomalias altas mayor al 90", 0, 0, 5, 1),
    ("dame en pdf las anomalias con mas del 80 por ciento de riesgo", 0, 0, 5, 1),
    ("necesito un pdf de las anomalias mas graves",                   0, 0, 5, 1),
    ("dame un reporte de riesgos en pdf",                             0, 0, 5, 1),

    # ── GENERAR_REPORTE + cuellos ────────────────────────────────────
    ("descargar excel con los cuellos de botella",                    0, 1, 5, 1),
    ("dame un pdf de los 10 procesos mas lentos",                     0, 1, 1, 1),
    ("exportar en word las tareas con mas retrasos",                  0, 1, 5, 1),
    ("generar reporte pdf de latencias",                              0, 1, 5, 1),
    ("informe excel de los 20 nodos mas demorados",                   0, 1, 2, 1),
    ("dame un reporte de los procesos que tardan mas",                0, 1, 5, 1),
    ("quiero descargar en excel los tiempos por etapa",               0, 1, 5, 1),

    # ── GENERAR_REPORTE + recientes ──────────────────────────────────
    ("dame las ultimas 10 instancias en pdf",                         0, 3, 1, 1),
    ("excel con los 20 tramites mas recientes",                       0, 3, 2, 1),
    ("exporta en word los ultimos 50 tramites creados",               0, 3, 3, 1),
    ("generar pdf de las instancias recientes",                       0, 3, 5, 1),
    ("dame un excel de lo mas nuevo en el sistema",                   0, 3, 5, 1),
    ("informe word de los ultimos tramites ingresados",               0, 3, 5, 1),

    # ── GENERAR_REPORTE + metricas ───────────────────────────────────
    ("necesito el reporte de metricas generales en excel",            0, 2, 5, 1),
    ("generar un informe de kpis en pdf",                             0, 2, 5, 1),
    ("exportar metricas del sistema a word",                          0, 2, 5, 1),
    ("dame el excel de estadisticas generales",                       0, 2, 5, 1),
    ("quiero un pdf con los indicadores clave",                       0, 2, 5, 1),
    ("reporte pdf con los flujos y sus instancias activas",           0, 4, 5, 1),

    # ── CONSULTA_ESTADO + anomalias ──────────────────────────────────
    ("informacion acerca de la mayor anomalia y a que se debe",       1, 0, 0, 1),
    ("cual es la mayor anomalia del sistema",                         1, 0, 0, 1),
    ("que anomalia es la mas grave",                                  1, 0, 0, 1),
    ("cuantas anomalias hay actualmente",                             1, 0, 5, 1),
    ("cuales son los tramites mas riesgosos",                         1, 0, 1, 1),
    ("dime las instancias con mayor riesgo",                          1, 0, 1, 1),
    ("hay algun tramite critico ahora mismo",                         1, 0, 5, 1),
    ("cual es el tramite con mas riesgo",                             1, 0, 0, 1),
    ("describe las anomalias del sistema",                            1, 0, 5, 1),
    ("que tramites estan en riesgo alto",                             1, 0, 5, 1),
    ("dime el estado de los riesgos",                                 1, 0, 5, 1),
    ("cuantos tramites estan en semaforo rojo",                       1, 0, 5, 1),
    ("cual es la situacion de riesgo actual",                         1, 0, 5, 1),
    ("tramites con anomalia detectada",                               1, 0, 5, 1),
    ("necesito informacion de las anomalias",                         1, 0, 5, 1),

    # ── CONSULTA_ESTADO + cuellos ────────────────────────────────────
    ("donde estan los cuellos de botella",                            1, 1, 5, 1),
    ("que etapa del flujo tarda mas",                                 1, 1, 0, 1),
    ("cual es el proceso mas lento",                                  1, 1, 0, 1),
    ("hay retrasos en algun paso del flujo",                          1, 1, 5, 1),
    ("dime cual es el peor cuello de botella",                        1, 1, 0, 1),
    ("que tareas generan demoras",                                    1, 1, 5, 1),
    ("donde se atasca mas el flujo",                                  1, 1, 5, 1),
    ("cuanto demora en promedio cada etapa",                          1, 1, 5, 1),
    ("cuales son las etapas mas demoradas",                           1, 1, 5, 1),
    ("dime el area de trabajo o actividad que ejecuto mas instancias",1, 1, 0, 1),
    ("cual es el area de trabajo mas lenta",                          1, 1, 0, 1),

    # ── CONSULTA_ESTADO + recientes ──────────────────────────────────
    ("cuales son los tramites mas recientes",                         1, 3, 1, 1),
    ("dime los ultimos tramites ingresados",                          1, 3, 1, 1),
    ("que tramites se registraron hoy",                               1, 3, 5, 1),
    ("muestra los ultimos 5 tramites",                                1, 3, 0, 1),

    # ── CONSULTA_ESTADO + flujos ─────────────────────────────────────
    ("cuales son los flujos activos actualmente",                     1, 4, 5, 1),
    ("cuantos flujos hay activos",                                    1, 4, 5, 1),
    ("que flujos estan publicados",                                   1, 4, 5, 1),
    ("cuales son los procesos publicados",                            1, 4, 5, 1),
    ("cuantas instancias tiene cada flujo",                           1, 4, 5, 1),
    ("dame informacion de los flujos",                                1, 4, 5, 1),
    ("listame los flujos de negocio",                                 1, 4, 5, 1),
    ("cuales son las politicas activas",                              1, 4, 5, 1),
    ("que politicas de negocio hay",                                  1, 4, 5, 1),
    ("cuales es la politica de negocio con mas tramites",             1, 4, 0, 1),
    ("dime que politica de negocio tiene mas tramites",               1, 4, 0, 1),
    ("que flujo de trabajo es mas usado",                             1, 4, 0, 1),

    # ── CONSULTA_ESTADO + general / metricas ─────────────────────────
    ("como esta el sistema",                                          1, 5, 5, 1),
    ("resumen general del sistema",                                   1, 5, 5, 1),
    ("dame un panorama del flujo",                                    1, 5, 5, 1),
    ("cuales son los kpis del sistema",                               1, 2, 5, 1),
    ("cuantos tramites hay en proceso",                               1, 5, 5, 1),
    ("que esta pasando en el sistema",                                1, 5, 5, 1),
    ("analisis del estado actual",                                    1, 5, 5, 1),
    ("informame del rendimiento del flujo",                           1, 5, 5, 1),
    ("dame estadisticas del dia",                                     1, 2, 5, 1),
    ("cuales son los indicadores actuales",                           1, 2, 5, 1),
    ("resumen ejecutivo del sistema",                                 1, 2, 5, 1),
    ("dame metricas del proceso",                                     1, 2, 5, 1),

    # ── AYUDA ────────────────────────────────────────────────────────
    ("hola",                                                          2, 5, 5, 1),
    ("buenos dias",                                                   2, 5, 5, 1),
    ("buenas tardes",                                                 2, 5, 5, 1),
    ("que puedes hacer",                                              2, 5, 5, 1),
    ("quien eres",                                                    2, 5, 5, 1),
    ("como me ayudas",                                                2, 5, 5, 1),
    ("para que sirves",                                               2, 5, 5, 1),
    ("necesito ayuda",                                                2, 5, 5, 1),
    ("ayuda",                                                         2, 5, 5, 1),
    ("que opciones tengo",                                            2, 5, 5, 1),
    ("que informacion me puedes dar",                                 2, 5, 5, 1),
]

# Heurísticas léxicas 

_FORMATO_PATTERNS = {
    "excel": [r"\bexcel\b", r"\bxls\b", r"\bxlsx\b"],
    "pdf":   [r"\bpdf\b"],
    "word":  [r"\bword\b", r"\bdocx?\b"],
}
_TEMA_PATTERNS = [
    # ORDEN CRÍTICO: anomalias > flujos > recientes > cuellos > metricas
    ("anomalias", [
        r"\banomal[ií]a",
        r"\bmayor.?anomal",
        r"\bmayor.?riesgo\b",
        r"\bcr[ií]tic\b",
        r"\bsem[aá]foro.?rojo\b",
        r"\briesgo.+\d",
        r"\binstancias.*riesgo\b",
    ]),
    ("flujos",    [r"\bflujo\b", r"\bpol[ií]tica\b", r"\bpublicad\b"]),
    ("recientes", [r"\breciente", r"\b[uú]ltim", r"\bhoy\b", r"\bingresad", r"\bantigu"]),
    ("cuellos",   [r"\bcuello\b", r"\blatencia\b", r"\batasco\b", r"\bm[aá]s lent", r"\b[aá]rea(?:s)? de trabajo\b", r"\bactividad(?:es)?\b", r"\btarea(?:s)?\b", r"\bejecuci[oó]n(?:es)?\b", r"\bejecutad[oa]s?\b"]),
    ("metricas",  [r"\bkpi\b", r"\bm[eé]tric", r"\bindi?cad", r"\brendimiento\b"]),
]
_NUMERO_RE  = re.compile(r"\b(\d+)\b")
_PORCENTAJE = re.compile(r"(\d+)\s*(?:por\s*ciento|%)")
# 'antiguo' y 'viejo' implican orden ASC (los más viejos primero)
_ORDEN_DESC = re.compile(r"\b(mayor|alto|grave|peor|m[aá]x|desc|reciente|nuevo)\b")
_ORDEN_ASC  = re.compile(r"\b(menor|m[ií]nimo|mejor|asc|antigu|viejo|primero)\b")
# Palabras que indican consulta directa (no generar archivo)
_LISTA_QUERY = re.compile(r"\b(lista|dame|dime|cu[aá]l|cu[aá]les|mu[eé]strame|hay|cu[aá]nto|cu[aá]nta|info|informaci[oó]n|cu[eé]ntame|explica|describe)\b")


def _extract_format(text: str) -> str:
    t = text.lower()
    for fmt, patterns in _FORMATO_PATTERNS.items():
        for p in patterns:
            if re.search(p, t):
                return fmt
    return "ninguno"


def _extract_tema_heuristic(text: str) -> str:
    t = text.lower()
    for tema, patterns in _TEMA_PATTERNS:
        for p in patterns:
            if re.search(p, t):
                return tema
    return "general"


def _extract_limite(text: str) -> int:
    # Detectar porcentaje primero (no es un límite de registros)
    nums = _NUMERO_RE.findall(text)
    pcts = _PORCENTAJE.findall(text)
    pct_vals = set(int(p) for p in pcts)
    clean_nums = [int(n) for n in nums if int(n) not in pct_vals]
    if clean_nums:
        n = clean_nums[0]
        if 1 <= n <= 5000:
            return n
    return 100


def _extract_umbral_pct(text: str) -> float:
    """Extrae umbral de riesgo en porcentaje (ej: '90%' → 0.9)."""
    m = _PORCENTAJE.search(text.lower())
    if m:
        return int(m.group(1)) / 100.0
    return 0.0


def _extract_orden(text: str) -> str:
    t = text.lower()
    if _ORDEN_ASC.search(t):
        return "asc"
    return "desc"


def _extract_estado(text: str):
    t = text.lower()
    if re.search(r"\bfinalizad[oa]s?\b", t):
        return "FINALIZADO"
    if re.search(r"\ben\s*proceso\b", t):
        return "EN_PROCESO"
    if re.search(r"\bcancelad[oa]s?\b", t):
        return "CANCELADO"
    if re.search(r"\bpau[sz]ad[oa]s?\b", t):
        return "EN_PAUSA"
    return None

def _extract_fecha(text: str):
    m = re.search(r"\b(\d{4}-\d{2}-\d{2})\b", text)
    if m: return m.group(1)
    m = re.search(r"\b(\d{1,2})[-/](\d{1,2})[-/](\d{4})\b", text)
    if m: return f"{m.group(3)}-{m.group(2).zfill(2)}-{m.group(1).zfill(2)}"
    return None


# ─────────────────────────────────────────────────────────────
# Clase principal
# ─────────────────────────────────────────────────────────────
class NLUReportPredictor:

    def __init__(self):
        self.model      = None
        self.vectorizer = None
        self.is_trained = False

        if TF_AVAILABLE:
            self._build_and_train()

    def _build_and_train(self):
        corpus = _CORPUS * 5        # x5 augmentación
        random.shuffle(corpus)

        texts  = [c[0] for c in corpus]
        y_int  = np.array([c[1] for c in corpus])
        y_tema = np.array([c[2] for c in corpus])
        y_lim  = np.array([c[3] for c in corpus])
        y_ord  = np.array([c[4] for c in corpus])

        self.vectorizer = TextVectorization(
            max_tokens=4000,
            output_sequence_length=40,
            standardize="lower_and_strip_punctuation",
        )
        self.vectorizer.adapt(texts)

        inp = Input(shape=(1,), dtype=tf.string, name="text_input")
        x   = self.vectorizer(inp)
        x   = Embedding(4000, 64, mask_zero=True)(x)
        x   = Bidirectional(LSTM(64, return_sequences=True, dropout=0.2))(x)
        x   = GlobalAveragePooling1D()(x)
        x   = Dense(128, activation="relu")(x)
        x   = BatchNormalization()(x)
        x   = Dropout(0.3)(x)
        shared = Dense(64, activation="relu")(x)

        out_intent = Dense(len(INTENT_LABELS), activation="softmax", name="out_intent")(shared)
        out_tema   = Dense(len(TEMA_LABELS),   activation="softmax", name="out_tema")(shared)
        out_limite = Dense(len(LIMITE_VALUES), activation="softmax", name="out_limite")(shared)
        out_orden  = Dense(len(ORDEN_LABELS),  activation="softmax", name="out_orden")(shared)

        self.model = Model(inputs=inp, outputs=[out_intent, out_tema, out_limite, out_orden])
        self.model.compile(
            optimizer=tf.keras.optimizers.Adam(0.001),
            loss={
                "out_intent": "sparse_categorical_crossentropy",
                "out_tema":   "sparse_categorical_crossentropy",
                "out_limite": "sparse_categorical_crossentropy",
                "out_orden":  "sparse_categorical_crossentropy",
            },
            loss_weights={"out_intent": 2.5, "out_tema": 2.0, "out_limite": 0.5, "out_orden": 0.5},
            metrics={"out_intent": "accuracy", "out_tema": "accuracy",
                     "out_limite": "accuracy", "out_orden": "accuracy"},
        )

        X = tf.constant(texts)
        self.model.fit(
            X,
            {"out_intent": y_int, "out_tema": y_tema, "out_limite": y_lim, "out_orden": y_ord},
            epochs=120, batch_size=16, verbose=0,
        )
        self.is_trained = True
        print("[NLU] Modelo TensorFlow entrenado exitosamente.")

    def analyze_intent(self, text: str) -> dict:
        formato          = _extract_format(text)
        tema_heuristic   = _extract_tema_heuristic(text)
        limite_heuristic = _extract_limite(text)
        orden_heuristic  = _extract_orden(text)
        umbral_pct       = _extract_umbral_pct(text)
        estado_heuristic = _extract_estado(text)
        fecha_heuristic  = _extract_fecha(text)
        solo_consulta    = bool(_LISTA_QUERY.search(text.lower()))

        if not TF_AVAILABLE or not self.is_trained:
            intent = "GENERAR_REPORTE" if formato != "ninguno" else "CONSULTA_ESTADO"
            return self._pack(intent, tema_heuristic, limite_heuristic,
                              orden_heuristic, formato, umbral_pct, estado_heuristic, fecha_heuristic, conf=0.0)

        x_tensor = tf.constant([text])
        preds    = self.model.predict(x_tensor, verbose=0)

        conf_intent = float(np.max(preds[0][0]))
        conf_tema   = float(np.max(preds[1][0]))

        intent     = INTENT_LABELS[int(np.argmax(preds[0][0]))]
        tema       = TEMA_LABELS  [int(np.argmax(preds[1][0]))]
        limite_val = LIMITE_VALUES[int(np.argmax(preds[2][0]))]
        orden      = ORDEN_LABELS [int(np.argmax(preds[3][0]))]

        # ── Post-procesamiento heurístico ──────────────────────────
        # 1. Baja confianza → heurística léxica
        if conf_intent < 0.55:
            intent = "GENERAR_REPORTE" if formato != "ninguno" else "CONSULTA_ESTADO"

        # 2. Reporte sin formato → consulta
        if intent == "GENERAR_REPORTE" and formato == "ninguno":
            intent = "CONSULTA_ESTADO"

        # 3. "dame una lista / dime / cuáles..." sin formato → siempre consulta
        if solo_consulta:
            intent = "CONSULTA_ESTADO"

        # 4. Tema heurístico prevalece si la red no está segura o si detecta fuertemente una entidad
        if tema_heuristic != "general":
            tema = tema_heuristic
        elif tema_heuristic == "anomalias" and tema != "anomalias":
            tema = "anomalias"

        # 5. Número explícito en texto prevalece sobre la red
        if limite_heuristic != 100:
            limite_val = limite_heuristic
        if limite_val == 0:
            limite_val = 100

        # 6. "antiguo/viejo" → orden ASC (los más viejos primero)
        if _ORDEN_ASC.search(text.lower()):
            orden = "asc"

        return self._pack(intent, tema, limite_val, orden, formato, umbral_pct, estado_heuristic, fecha_heuristic, conf=conf_intent)

    def _pack(self, intent, tema, limite, orden, formato, umbral_pct=0.0, estado=None, fecha=None, conf=1.0):
        return {
            "intent": intent,
            "conf":   conf,   # confianza del modelo (0-1), usada en el router para fallback KB
            "entities": {
                "formato":    formato,
                "tema":       tema,
                "limite":     int(limite),
                "orden":      orden,
                "umbral_pct": umbral_pct,
                "estado":     estado,
                "fecha":      fecha,
            }
        }
