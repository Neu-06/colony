export interface CampoForm {
  nombre: string;
  tipo: string;
  requerido: boolean;
}

export interface Arista {
  origenNodoId: string;
  destinoNodoId: string;
  sourceOutputKey?: string;
  targetInputKey?: string;
}

export interface Swimlane {
  id: string;
  nombre: string;
  orden: number;
}

export interface NodoBase {
  idNodo: string;
  tipo: string;
  posicion: {
    x: number;
    y: number;
  };
  swimlaneId: string;
}

export interface NodoActividad extends NodoBase {
  nombre: string;
  esquemaFormulario: CampoForm[];
}

export interface NodoCompuerta extends NodoBase {
  condicionLogica: string;
}

export type NodoCanvas = NodoActividad | NodoCompuerta;

export interface PoliticaNegocio {
  id?: string;
  nombre: string;
  version: number;
  estado: string;
  creadoPor?: string;
  fechaCreacion?: string;
  swimlanes?: Swimlane[];
  nodos: NodoCanvas[];
  aristas: Arista[];
}
