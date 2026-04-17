import { Arista, NodoActividad, NodoCanvas, NodoCompuerta, PoliticaNegocio } from '../../core/models/canvas.models';

export interface WorkflowGraphSnapshot {
  swimlanes: { id: string; nombre: string; orden: number }[];
  nodos: NodoCanvas[];
  aristas: Arista[];
}

export interface PolicyMeta {
  id?: string;
  nombre: string;
  estado: string;
  version: number;
  creadoPor?: string;
  fechaCreacion?: string;
}

export function fromPoliticaToWorkflowGraph(politica: PoliticaNegocio): WorkflowGraphSnapshot {
  const swimlanes = (politica.swimlanes ?? [])
    .map((lane, index) => ({
      id: lane.id || `lane-${index + 1}`,
      nombre: lane.nombre?.trim() || `Departamento ${index + 1}`,
      orden: Number(lane.orden ?? index + 1)
    }))
    .sort((a, b) => a.orden - b.orden);

  const normalizedSwimlanes = swimlanes.length
    ? swimlanes
    : [{ id: 'lane-1', nombre: 'Departamento 1', orden: 1 }];

  return {
    swimlanes: normalizedSwimlanes,
    nodos: (politica.nodos ?? []).map((node) => cloneNode(node)),
    aristas: (politica.aristas ?? []).map((edge) => ({
      origenNodoId: edge.origenNodoId,
      destinoNodoId: edge.destinoNodoId,
      etiqueta: edge.etiqueta,
      sourceOutputKey: edge.sourceOutputKey,
      targetInputKey: edge.targetInputKey
    }))
  };
}

export function toPoliticaFromWorkflowGraph(snapshot: WorkflowGraphSnapshot, meta: PolicyMeta): PoliticaNegocio {
  return {
    id: meta.id,
    nombre: meta.nombre,
    estado: meta.estado,
    version: meta.version,
    creadoPor: meta.creadoPor,
    fechaCreacion: meta.fechaCreacion,
    swimlanes: snapshot.swimlanes.map((lane, index) => ({
      id: lane.id,
      nombre: lane.nombre?.trim() || `Departamento ${index + 1}`,
      orden: Number(lane.orden ?? index + 1)
    })),
    nodos: snapshot.nodos.map((node) => cloneNode(node)),
    aristas: snapshot.aristas.map((edge) => ({
      origenNodoId: edge.origenNodoId,
      destinoNodoId: edge.destinoNodoId,
      etiqueta: edge.etiqueta,
      sourceOutputKey: edge.sourceOutputKey,
      targetInputKey: edge.targetInputKey
    }))
  };
}

function cloneNode(node: NodoCanvas): NodoCanvas {
  if (isGatewayNode(node)) {
    const gatewayNode = node as NodoCompuerta;
    return {
      idNodo: gatewayNode.idNodo,
      tipo: gatewayNode.tipo,
      posicion: {
        x: Number(gatewayNode.posicion?.x ?? 0),
        y: Number(gatewayNode.posicion?.y ?? 0)
      },
      swimlaneId: gatewayNode.swimlaneId || 'lane-1',
      condicionLogica: gatewayNode.condicionLogica ?? ''
    };
  }

  const activityNode = node as NodoActividad;
  return {
    idNodo: activityNode.idNodo,
    tipo: activityNode.tipo,
    posicion: {
      x: Number(activityNode.posicion?.x ?? 0),
      y: Number(activityNode.posicion?.y ?? 0)
    },
    swimlaneId: activityNode.swimlaneId || 'lane-1',
    nombre: activityNode.nombre ?? 'Nueva Tarea',
    esquemaFormulario: (activityNode.esquemaFormulario ?? []).map((field) => ({
      nombre: field.nombre ?? '',
      tipo: field.tipo ?? 'Texto',
      requerido: !!field.requerido
    }))
  };
}

function isGatewayNode(node: NodoCanvas): node is NodoCompuerta {
  return node.tipo === 'compuerta' || node.tipo === 'gateway';
}
