import os
import sys
import random
import datetime
import uuid
from dotenv import load_dotenv
from pymongo import MongoClient
from faker import Faker

fake = Faker('es_ES')

# Cargar variables de entorno
current_dir = os.path.dirname(os.path.abspath(__file__))
env_path = os.path.join(current_dir, '..', '..', '.env')
load_dotenv(env_path)

mongo_uri = os.environ.get("SPRING_DATA_MONGODB_URI")
if not mongo_uri:
    print("Error: SPRING_DATA_MONGODB_URI no encontrada en .env")
    sys.exit(1)

client = MongoClient(mongo_uri)
db = client.get_database() # Toma por defecto colony_db de la URI

USERS = [
    "6a246f3c0a4dbb4b8b709d7f",
    "6a246f540a4dbb4b8b709d80",
    "6a246f620a4dbb4b8b709d81",
    "6a246f7b0a4dbb4b8b709d82"
]

def get_valid_paths(politica):
    """Encuentra rutas desde 'inicio' hasta 'fin' usando las aristas."""
    nodos = {n['idNodo']: n for n in politica.get('nodos', [])}
    aristas = politica.get('aristas', [])
    
    inicio_id = next((n['idNodo'] for n in nodos.values() if n.get('tipo') == 'inicio'), None)
    if not inicio_id:
        return []
    
    adj = {n['idNodo']: [] for n in nodos.values()}
    for a in aristas:
        origen = a.get('origenNodoId')
        destino = a.get('destinoNodoId')
        if origen in adj and destino in adj:
            adj[origen].append(destino)
            
    paths = []
    def dfs(current, path):
        if current in path:
            return
        path.append(current)
        
        nodo_data = nodos.get(current, {})
        if not adj[current] or nodo_data.get('tipo') == 'fin':
            paths.append(list(path))
            path.pop()
            return
            
        for nxt in adj[current]:
            dfs(nxt, path)
            
        path.pop()
        
    dfs(inicio_id, [])
    return paths

def generate_mock_text(urgency, is_complaint=False):
    textos_altos = [
        "Esto es urgente, llevo semanas esperando una respuesta. Por favor resuelvan pronto.",
        "Emergencia. Necesito que se atienda mi solicitud inmediatamente, es crítico.",
        "Error fatal en la facturación, necesito soporte urgente.",
        "Estoy muy enojado con el servicio, exijo solución rápida o cancelo mi contrato.",
        "Ya estoy cansado de las demoras, su servicio es inaceptable."
    ]
    textos_medios = [
        "Quisiera saber el estado de mi solicitud por favor.",
        "Tengo un problema con el producto, no funciona como esperaba.",
        "Solicito una revisión de mi trámite.",
        "¿Cuándo tendré respuesta a este requerimiento?",
        "Espero tener respuesta pronto."
    ]
    textos_bajos = [
        "Solo es una consulta general, no hay apuro.",
        "Actualización de datos personales para la base de datos.",
        "Quiero más información sobre sus servicios para futuro.",
        "Sugerencia para mejorar la interfaz del sistema.",
        "Sin comentarios adicionales, gracias."
    ]
    
    if urgency == "ALTA":
        return random.choice(textos_altos)
    elif urgency == "MEDIA":
        return random.choice(textos_medios)
    else:
        return random.choice(textos_bajos)

def generate_dynamic_data(politica_nombre, urgencia_esperada):
    nombre_lower = politica_nombre.lower()
    
    # 6a2474ba0a4dbb4b8b709d88 - Gestion de Quejas y Reclamos
    if "queja" in nombre_lower or "reclamo" in nombre_lower:
        return {
            "notas finales": fake.sentence(nb_words=6),
            "Nombre Cliente": fake.name(),
            "motivo reclamo": generate_mock_text(urgencia_esperada, True),
            "devolver dinero": random.choice([True, False]),
            "satisfaccion 1- 10": random.randint(1, 10)
        }
    # 6a24881b0a4dbb4b8b709d8c - Instalación de Paneles Solares
    elif "panel" in nombre_lower or "solar" in nombre_lower:
        return {
            "nombre cliente": fake.name(),
            "telefono": fake.phone_number()[:10],
            "cantidad de paneles": random.randint(10, 100),
            "codigo de tramite": fake.bothify(text='??-####').upper(),
            "dias totales": random.randint(3, 14)
        }
    # 6a248d190a4dbb4b8b709d8d - Instalación de Internet Fibra Optica
    elif "internet" in nombre_lower or "fibra" in nombre_lower:
        return {
            "nombre ": fake.name(),
            "plan requerido": random.choice(["50", "100", "200", "500", "1000"]),
            "direccion": fake.address(),
            "telefono ": fake.phone_number()[:10],
            "factible": random.choice(["Aceptado", "Rechazado", "Pendiente"]),
            "fecha y hora": fake.date_time_this_year().strftime("%Y-%m-%dT%H:%M"),
            "metros cable": random.randint(10, 300)
        }
    else:
        # Default estandar
        return {
            "motivo": generate_mock_text(urgency=urgencia_esperada),
            "cliente_id": str(uuid.uuid4())[:8],
            "solicitante": fake.name(),
            "categoria": random.choice(["Consulta", "Reclamo", "Soporte Técnico", "Ventas"])
        }

def generate_mock_documents():
    num_docs = random.randint(0, 3)
    docs = []
    tipos = [
        {"ext": ".pdf", "mime": "application/pdf", "nombres": ["contrato", "documento_identidad", "reporte", "informe_tecnico"]},
        {"ext": ".jpg", "mime": "image/jpeg", "nombres": ["factura", "plano", "foto_lugar", "identificacion"]},
        {"ext": ".docx", "mime": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "nombres": ["Contrato", "formulario_lleno", "carta_poder"]},
        {"ext": ".xlsx", "mime": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "nombres": ["Hoja", "presupuesto", "calculos"]}
    ]
    
    for _ in range(num_docs):
        tipo = random.choice(tipos)
        nombre = f"{random.choice(tipo['nombres'])}{tipo['ext']}"
        doc_id = str(uuid.uuid4())
        docs.append({
            "documentoId": doc_id,
            "nombre": nombre,
            "tipoMime": tipo["mime"],
            "s3Key": f"instancias/mock/{doc_id}_{nombre}",
            "subidoPor": random.choice(USERS),
            "fechaSubida": datetime.datetime.now(datetime.timezone.utc),
            "tamanoBytes": random.randint(1024, 5 * 1024 * 1024)
        })
    return docs

def generate_data():
    politicas = list(db.politicas_negocio.find({"estado": "PUBLICADA"}))
    if not politicas:
        print("No se encontraron políticas PUBLICADAS.")
        return
        
    print(f"Encontradas {len(politicas)} políticas publicadas.")
    
    instancias_collection = db.instancias
    historial_collection = db.historial
    
    # Optional clean-up
    # instancias_collection.delete_many({"iniciadoPor": {"$in": USERS}, "codigo": {"$regex": "^TRM-MOCK"}})
    # historial_collection.delete_many({"ejecutadoPor": {"$in": USERS}})
    
    total_instancias = 0
    total_historial = 0
    
    # Queremos al menos 1000 en total, así que distribuimos uniformemente
    # Ej: si hay 3 políticas, ~340 cada una.
    instancias_por_politica = 1050 // len(politicas)
    
    for pol in politicas:
        paths = get_valid_paths(pol)
        if not paths:
            print(f"Política {pol.get('nombre')} no tiene rutas válidas.")
            continue
            
        print(f"Generando data para política '{pol.get('nombre')}' ({len(paths)} rutas)")
        
        for i in range(instancias_por_politica):
            # Seleccionar una ruta
            ruta_completa = random.choice(paths)
            
            # Decidir el estado de la instancia
            # 80% FINALIZADO, 20% EN_PROCESO
            estado_general = random.choices(["FINALIZADO", "EN_PROCESO"], weights=[0.8, 0.2])[0]
            
            ruta_actual = ruta_completa
            if estado_general == "EN_PROCESO" and len(ruta_completa) > 2:
                # Truncar la ruta al azar para dejarlo en proceso
                cut_idx = random.randint(2, len(ruta_completa) - 1)
                ruta_actual = ruta_completa[:cut_idx]
            
            # Decidir si esta instancia será "anómala" (5% de probabilidad)
            is_anomaly = random.random() < 0.05
            
            # Fechas (últimos 60 días)
            days_ago = random.randint(1, 60)
            base_date = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=days_ago, hours=random.randint(0, 23), minutes=random.randint(0, 59))
            
            # Generar datos dinámicos
            urgencia_esperada = "BAJA"
            if is_anomaly:
                urgencia_esperada = "ALTA"
            elif random.random() < 0.2:
                urgencia_esperada = "ALTA"
            elif random.random() < 0.5:
                urgencia_esperada = "MEDIA"
                
            datos_dinamicos = generate_dynamic_data(pol.get('nombre', ''), urgencia_esperada)
            documentos = generate_mock_documents()
            
            instancia_id = str(uuid.uuid4())
            # Formato TRM-XXXXXXXX
            codigo = f"TRM-MOCK{str(uuid.uuid4())[:4].upper()}"
            
            # Riesgo/Anomalia
            riesgo = random.uniform(0.7, 0.99) if is_anomaly else random.uniform(0.05, 0.45)
            prioridad = 3 if urgencia_esperada == "ALTA" else (2 if urgencia_esperada == "MEDIA" else 1)
            
            nodos_actuales = []
            if estado_general == "EN_PROCESO":
                nodos_actuales = [ruta_actual[-1]]
            
            instancia = {
                "_id": instancia_id,
                "codigo": codigo,
                "politicaId": str(pol["_id"]),
                "iniciadoPor": random.choice(USERS),
                "estadoGeneral": estado_general,
                "nodosActualesIds": nodos_actuales,
                "semaforo": "VERDE" if not is_anomaly else "ROJO",
                "datosDinamicos": datos_dinamicos,
                "fechaInicio": base_date,
                "fechaFin": None,
                "prioridadAnalitica": prioridad,
                "scoreRiesgo": riesgo,
                "anomaliaDetectada": is_anomaly,
                "documentosAdjuntos": documentos,
                "_class": "com.colony.core.domain.Instancia"
            }
            
            current_time = base_date
            for idx in range(len(ruta_actual) - 1):
                origen = ruta_actual[idx]
                destino = ruta_actual[idx+1]
                
                fecha_ingreso = current_time
                
                if is_anomaly and idx == len(ruta_actual) // 2:
                    tiempo_espera_segundos = random.randint(24*3600, 72*3600)
                else:
                    tiempo_espera_segundos = random.randint(600, 4*3600)
                    
                fecha_inicio_atencion = fecha_ingreso + datetime.timedelta(seconds=random.randint(60, 600))
                fecha_fin_atencion = fecha_ingreso + datetime.timedelta(seconds=tiempo_espera_segundos)
                
                historial = {
                    "_id": str(uuid.uuid4()),
                    "instanciaID": instancia_id,
                    "politicaId": str(pol["_id"]),
                    "nodoOrigen": origen,
                    "nodoDestino": destino,
                    "ejecutadoPor": random.choice(USERS),
                    "accionTomada": "AVANZAR" if idx < len(ruta_actual)-2 or estado_general == "EN_PROCESO" else "FIN",
                    "fechaTransicion": fecha_fin_atencion,
                    "fechaIngreso": fecha_ingreso,
                    "fechaInicioAtencion": fecha_inicio_atencion,
                    "fechaFinAtencion": fecha_fin_atencion,
                    "tiempoEnNodo": float(tiempo_espera_segundos),
                    "tiempoResolucionSegundos": tiempo_espera_segundos,
                    "_class": "com.colony.core.domain.Historial"
                }
                
                historial_collection.insert_one(historial)
                total_historial += 1
                
                current_time = fecha_fin_atencion
                
            if estado_general == "FINALIZADO":
                instancia["fechaFin"] = current_time
                
            instancias_collection.insert_one(instancia)
            total_instancias += 1

    print(f"Éxito: Se generaron {total_instancias} instancias y {total_historial} registros de historial de forma realista y distribuida.")

if __name__ == "__main__":
    generate_data()
