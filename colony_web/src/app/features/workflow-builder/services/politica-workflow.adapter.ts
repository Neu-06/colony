import { Arista, Carril, NodoActividad, NodoCanvas, NodoCompuerta, PoliticaNegocio } from '../models/canvas.models';

export interface SnapshotWorkflow {
  carriles: Carril[];
  nodos: NodoCanvas[];
  aristas: Arista[];
}

export interface MetaPolitica {
  id?: string;
  nombre: string;
  estado: string;
  version: number;
  creadoPor?: string;
  fechaCreacion?: string;
}

export function fromPoliticaToSnapshot(politica: PoliticaNegocio): SnapshotWorkflow {
  const carrilesOrigen = politica.carriles ?? [];

  const carriles = carrilesOrigen
    .map((carril, index) => ({
      id: carril.id || `carril-${index + 1}`,
      nombre: carril.nombre?.trim() || `Departamento ${index + 1}`,
      departamentoId: carril.departamentoId,
      orden: Number(carril.orden ?? index + 1)
    }))
    .sort((a, b) => a.orden - b.orden);

  const carrilesNormalizados = carriles.length
    ? carriles
    : [{ id: 'carril-1', nombre: 'Departamento 1', departamentoId: undefined, orden: 1 }];

  return {
    carriles: carrilesNormalizados,
    nodos: (politica.nodos ?? []).map((nodo) => clonarNodo(nodo)),
    aristas: (politica.aristas ?? []).map((arista) => ({
      origenNodoId: arista.origenNodoId,
      destinoNodoId: arista.destinoNodoId,
      salidaOrigenId: arista.salidaOrigenId,
      entradaDestinoId: arista.entradaDestinoId,
      etiqueta: arista.etiqueta,
      condicion: arista.condicion
    }))
  };
}

export function toPoliticaFromSnapshot(snapshot: SnapshotWorkflow, meta: MetaPolitica): PoliticaNegocio {
  const carriles = snapshot.carriles.map((carril, index) => ({
    id: carril.id,
    nombre: carril.nombre?.trim() || `Departamento ${index + 1}`,
    departamentoId: carril.departamentoId,
    orden: Number(carril.orden ?? index + 1)
  }));

  return {
    id: meta.id,
    nombre: meta.nombre,
    estado: meta.estado,
    version: meta.version,
    creadoPor: meta.creadoPor,
    fechaCreacion: meta.fechaCreacion,
    carriles,
    nodos: snapshot.nodos.map((nodo) => clonarNodo(nodo)),
    aristas: snapshot.aristas.map((arista) => ({
      origenNodoId: arista.origenNodoId,
      destinoNodoId: arista.destinoNodoId,
      salidaOrigenId: arista.salidaOrigenId,
      entradaDestinoId: arista.entradaDestinoId,
      etiqueta: arista.etiqueta,
      condicion: arista.condicion
    }))
  };
}

function clonarNodo(nodo: NodoCanvas): NodoCanvas {
  if (isNodoCompuerta(nodo)) {
    const compuerta = nodo as NodoCompuerta;
    return {
      idNodo: compuerta.idNodo,
      tipo: normalizarTipo(compuerta.tipo),
      posicion: {
        x: Number(compuerta.posicion?.x ?? 0),
        y: Number(compuerta.posicion?.y ?? 0)
      },
      carrilId: compuerta.carrilId || 'carril-1',
      condicionLogica: compuerta.condicionLogica ?? ''
    };
  }

  const actividad = nodo as NodoActividad;
  return {
    idNodo: actividad.idNodo,
    tipo: normalizarTipo(actividad.tipo),
    posicion: {
      x: Number(actividad.posicion?.x ?? 0),
      y: Number(actividad.posicion?.y ?? 0)
    },
    carrilId: actividad.carrilId || 'carril-1',
    nombre: actividad.nombre ?? 'Nueva Tarea',
    dptoResponsable: actividad.dptoResponsable ?? '',
    esquemaFormulario: (actividad.esquemaFormulario ?? []).map((campo) => ({
      id: campo.id || crypto.randomUUID(),
      nombre: campo.nombre ?? '',
      tipo: normalizarTipoCampo(campo.tipo),
      requerido: !!campo.requerido
    }))
  };
}

function isNodoCompuerta(nodo: NodoCanvas): nodo is NodoCompuerta {
  return nodo.tipo === 'compuerta' || nodo.tipo === 'gateway' || nodo.tipo === 'salida_condicional';
}

function normalizarTipo(tipo: string): string {
  if (tipo === 'start' || tipo === 'inicio') {
    return 'inicio';
  }

  if (tipo === 'end' || tipo === 'fin') {
    return 'fin';
  }

  if (tipo === 'task' || tipo === 'actividad' || tipo === 'tarea') {
    return 'tarea';
  }

  if (tipo === 'gateway' || tipo === 'salida_condicional' || tipo === 'compuerta') {
    return 'compuerta';
  }

  return tipo || 'tarea';
}

function normalizarTipoCampo(tipo: string | undefined): string {
  const valor = (tipo ?? '').toLowerCase();

  if (valor === 'numero' || valor === 'number') {
    return 'number';
  }

  if (valor === 'fecha' || valor === 'date') {
    return 'date';
  }

  if (valor === 'booleano' || valor === 'boolean' || valor === 'bool') {
    return 'boolean';
  }

  return 'text';
}
