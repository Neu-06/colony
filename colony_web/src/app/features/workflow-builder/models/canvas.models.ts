export type PermisoDocumental = 'SIN_ACCESO' | 'SOLO_LECTURA' | 'SUBIR_Y_LEER' | 'ADMINISTRAR';

export interface CampoFormulario {
  id?: string;
  nombre: string;
  tipo: string;
  requerido: boolean;
  opciones?: string;
}

export interface Arista {
  origenNodoId: string;
  destinoNodoId: string;
  salidaOrigenId?: string;
  entradaDestinoId?: string;
  etiqueta?: string;
  condicion?: string;
}

export interface Carril {
  id: string;
  nombre: string;
  departamentoId?: string;
  orden: number;
  altoPx?: number;
  alto?: number;
}

export interface NodoBase {
  idNodo: string;
  tipo: string;
  posicion: {
    x: number;
    y: number;
  };
  carrilId: string;
}

export interface NodoActividad extends NodoBase {
  nombre: string;
  dptoResponsable?: string;
  esquemaFormulario: CampoFormulario[];
  permisoDocumental?: PermisoDocumental;
}

export interface NodoCompuerta extends NodoBase {
  condicionLogica: string;
}

export type NodoCanvas = NodoActividad | NodoCompuerta;

export interface PoliticaNegocio {
  id?: string;
  nombre: string;
  codigoInvitacion?: string;
  editoresAutorizados?: string[];
  version: number;
  estado: string;
  creadoPor?: string;
  fechaCreacion?: string;
  carriles?: Carril[];
  nodos: NodoCanvas[];
  aristas: Arista[];
}

export type TipoNodoHerramienta = 'inicio' | 'tarea' | 'compuerta' | 'fork' | 'join' | 'fin';
