"""
Base de Conocimiento Semántica — Colony BPMS AI.

Usa TF-IDF + Cosine Similarity (NumPy/sklearn) para:
1. Responder preguntas de dominio que el LSTM no conoce.
2. Servir como red de seguridad cuando la confianza del modelo es baja.
3. Resolver preguntas conceptuales sobre el sistema BPMS.

100% local, sin APIs externas. Se entrena en RAM al arrancar.
"""
from __future__ import annotations
import numpy as np
import re
import unicodedata

try:
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import cosine_similarity
    SKLEARN_OK = True
except ImportError:
    SKLEARN_OK = False
    print("[KB] sklearn no disponible — Knowledge Base desactivada.")


# ─────────────────────────────────────────────────────────────
# Base de conocimiento de dominio BPMS
# (pregunta_canónica, respuesta_natural)
# ─────────────────────────────────────────────────────────────
_KB: list[tuple[str, str]] = [
    # Conceptos generales BPMS
    ("que es un semaforo rojo",
     "El semáforo rojo indica que un trámite tiene un nivel de riesgo crítico, generalmente superior al 70%. "
     "Significa que el proceso está atrasado, bloqueado o presenta anomalías que requieren atención inmediata."),

    ("que es un semaforo amarillo",
     "El semáforo amarillo indica un nivel de riesgo moderado. El trámite avanza, pero presenta señales de "
     "posible retraso o condiciones que podrían derivar en un problema si no se atienden."),

    ("que es un semaforo verde",
     "El semáforo verde indica que el trámite fluye con normalidad. El riesgo es bajo y el proceso avanza "
     "dentro de los tiempos esperados."),

    ("que es el score de riesgo",
     "El score de riesgo es un valor calculado por los modelos de TensorFlow del sistema, que va de 0 a 1 "
     "(o 0% a 100%). Representa la probabilidad de que un trámite sufra un retraso crítico o una anomalía. "
     "Se calcula analizando el historial de avance, los tiempos entre etapas y patrones históricos similares."),

    ("que es la prioridad analitica",
     "La prioridad analítica es un valor entero (1, 2 o 3) asignado por la IA del sistema. "
     "3 = máxima urgencia, 2 = media y 1 = baja. Se usa para ordenar la bandeja de tareas "
     "de forma que los funcionarios atiendan primero lo más crítico."),

    ("que es un cuello de botella",
     "Un cuello de botella es una etapa del flujo de trabajo donde los trámites se acumulan y tardan "
     "más tiempo del esperado en resolverse. Puede deberse a alta carga de trabajo, falta de personal, "
     "condiciones de aprobación complejas o dependencias entre tareas."),

    ("que es una anomalia",
     "Una anomalía es una condición detectada por el autoencoder de TensorFlow del sistema, que indica "
     "que un trámite se comporta de forma inusual respecto a los patrones históricos. "
     "Puede ser un tiempo excesivo en una etapa, un ciclo inesperado o una secuencia atípica de nodos."),

    ("que es un fork",
     "Un fork (o bifurcación) es el punto del flujo donde el proceso se divide en varias tareas paralelas. "
     "Todos los caminos deben completarse antes de que el trámite pueda continuar. "
     "Los delays en un fork generalmente se deben a alta carga de trabajo en el punto de distribución."),

    ("que es un join",
     "Un join (o convergencia) es el punto del flujo donde las tareas paralelas se juntan nuevamente. "
     "El trámite no puede avanzar hasta que TODAS las ramas del fork anterior hayan sido completadas. "
     "Si una sola tarea paralela se retrasa, el join bloquea todo el proceso."),

    ("que es una compuerta",
     "Una compuerta es un nodo de decisión en el flujo. Según una condición evaluada automáticamente "
     "o por un funcionario, el trámite toma uno de los caminos posibles. "
     "Las compuertas lentas suelen indicar decisiones pendientes o criterios complejos de evaluación."),

    ("que significa en proceso",
     "El estado 'EN PROCESO' indica que el trámite está activo y en curso dentro del flujo de trabajo. "
     "Tiene al menos una tarea pendiente de completar."),

    ("que significa finalizado",
     "El estado 'FINALIZADO' indica que el trámite completó todas sus etapas y llegó al nodo final del flujo."),

    ("que significa anulado",
     "El estado 'ANULADO' indica que el trámite fue cancelado antes de finalizar, "
     "ya sea por solicitud del interesado, por incumplimiento de condiciones o por decisión administrativa."),

    # Preguntas operativas
    ("como se calcula el riesgo de un tramite",
     "El riesgo se calcula con una red neuronal DNN entrenada con el historial de trámites anteriores. "
     "Los factores principales son: tiempo acumulado en etapas, cantidad de veces que se revisó el documento, "
     "urgencia del solicitante y patrones de demora en el tipo de proceso. "
     "El valor resultante va de 0% (sin riesgo) a 100% (riesgo máximo)."),

    ("como mejorar el rendimiento del flujo",
     "Para mejorar el rendimiento, se recomienda: 1) Revisar y resolver los trámites marcados en rojo primero. "
     "2) Identificar los nodos con mayor tiempo promedio y asignar más recursos. "
     "3) Simplificar las condiciones de compuertas que generan demoras frecuentes. "
     "4) Establecer tiempos máximos de resolución por etapa como SLA internos."),

    ("que es un tramite",
     "Un trámite (o instancia) es una ejecución concreta de un flujo de negocio. "
     "Por ejemplo, una solicitud de crédito, una aprobación de documento o un proceso de onboarding "
     "son trámites que pasan por etapas definidas en la política de negocio."),

    ("cuantos tramites hay",
     "Para saber el total de trámites activos, puedes preguntarme directamente y consultaré la base de datos. "
     "También puedo darte un desglose por estado (en proceso, finalizados) o por semáforo."),

    ("que puedo consultar",
     "Puedes consultarme sobre: anomalías y riesgos críticos, cuellos de botella por etapa, "
     "trámites más recientes o más antiguos, flujos publicados y sus instancias, "
     "métricas generales del sistema, y conceptos del flujo de trabajo como semáforos, forks, joins y compuertas. "
     "También puedo generar reportes descargables en Excel, PDF o Word."),

    ("como generar un reporte",
     "Solo dime qué información necesitas y en qué formato. Por ejemplo: "
     "'Dame un PDF de los 10 trámites con mayor riesgo' o "
     "'Genera un Excel con los cuellos de botella del flujo'. "
     "Los formatos disponibles son Excel, PDF y Word."),

    ("que formatos de reporte hay",
     "Puedo generar reportes en tres formatos: Excel (.xlsx) para análisis de datos, "
     "PDF para presentaciones formales e informes, y Word (.docx) para documentos editables."),

    ("que es la prioridad",
     "La prioridad analítica indica qué tan urgente es atender un trámite. "
     "Va de 1 (baja urgencia) a 3 (máxima urgencia) y es calculada automáticamente por los modelos de IA "
     "basándose en el riesgo, el tiempo en proceso y el tipo de flujo."),

    ("informacion del sistema",
     "El sistema Colony BPMS gestiona flujos de trabajo empresariales con analítica de inteligencia artificial. "
     "Monitorea trámites en tiempo real, detecta anomalías con autoencoders, predice riesgos con redes neuronales "
     "y genera alertas automáticas para los equipos de trabajo."),
]

# Expandir con variaciones para mayor cobertura
_EXTRA_ALIASES = [
    ("semaforo rojo que significa",          _KB[0][1]),
    ("que significa rojo",                   _KB[0][1]),
    ("que significa riesgo critico",         _KB[0][1]),
    ("que significa amarillo",               _KB[1][1]),
    ("que significa verde",                  _KB[2][1]),
    ("como se calcula el score",             _KB[12][1]),
    ("para que sirve la ia",                 _KB[14][1]),
    ("que tipos de reporte puedo descargar", _KB[16][1]),
    ("en que formato puedo exportar",        _KB[16][1]),
    ("como funciona el riesgo",              _KB[12][1]),
    ("que es un proceso",                    _KB[10][1]),
]

_ALL_KB = _KB + _EXTRA_ALIASES


def _normalize(text: str) -> str:
    """Elimina acentos, pasa a minúsculas y remueve puntuación."""
    text = text.lower()
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    text = re.sub(r"[^\w\s]", " ", text)
    return text.strip()


class KnowledgeBase:
    """
    Motor de búsqueda semántica local basado en TF-IDF + Cosine Similarity.
    Actúa como fallback cuando el LSTM no reconoce la intención con suficiente confianza.
    """

    SIMILARITY_THRESHOLD = 0.25   # Mínimo para considerar un match válido

    def __init__(self):
        self._questions: list[str] = [_normalize(q) for q, _ in _ALL_KB]
        self._answers:   list[str] = [a for _, a in _ALL_KB]
        self._vectorizer = None
        self._matrix     = None

        if SKLEARN_OK:
            self._build_index()

    def _build_index(self):
        self._vectorizer = TfidfVectorizer(
            ngram_range=(1, 2),
            analyzer="word",
            min_df=1,
            sublinear_tf=True,
        )
        self._matrix = self._vectorizer.fit_transform(self._questions)
        print(f"[KB] Índice semántico listo con {len(self._questions)} entradas.")

    def search(self, query: str) -> tuple[str | None, float]:
        """
        Devuelve (respuesta, similitud) si hay un match aceptable, o (None, 0.0).
        """
        if not SKLEARN_OK or self._matrix is None:
            return None, 0.0

        q_norm   = _normalize(query)
        q_vec    = self._vectorizer.transform([q_norm])
        sims     = cosine_similarity(q_vec, self._matrix)[0]
        best_idx = int(np.argmax(sims))
        best_sim = float(sims[best_idx])

        if best_sim >= self.SIMILARITY_THRESHOLD:
            return self._answers[best_idx], best_sim
        return None, best_sim

    def is_available(self) -> bool:
        return SKLEARN_OK and self._matrix is not None
