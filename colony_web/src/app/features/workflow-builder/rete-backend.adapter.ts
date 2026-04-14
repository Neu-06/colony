import { NodeEditor } from 'rete';
import { AreaPlugin } from 'rete-area-plugin';
import { Arista, NodoActividad, NodoCanvas, NodoCompuerta, PoliticaNegocio } from '../../core/models/canvas.models';
import { WorkflowNode, WorkflowScheme, isGatewayNode } from './rete-nodes';

export interface WorkflowGraphSnapshot {
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
  return {
    nodos: (politica.nodos ?? []).map((node) => cloneNode(node)),
    aristas: (politica.aristas ?? []).map((edge) => ({
      origenNodoId: edge.origenNodoId,
      destinoNodoId: edge.destinoNodoId
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
    nodos: snapshot.nodos.map((node) => cloneNode(node)),
    aristas: snapshot.aristas.map((edge) => ({
      origenNodoId: edge.origenNodoId,
      destinoNodoId: edge.destinoNodoId
    }))
  };
}

export function fromEditorToWorkflowGraph(
  editor: NodeEditor<WorkflowScheme>,
  area: AreaPlugin<WorkflowScheme>
): WorkflowGraphSnapshot {
  const nodos = editor.getNodes().map((node) => {
    const workflowNode = node as WorkflowNode;
    const position = area.nodeViews.get(workflowNode.id)?.position ?? workflowNode.payload.posicion;
    const payload = cloneNode(workflowNode.payload);

    payload.posicion = {
      x: Number(position?.x ?? 0),
      y: Number(position?.y ?? 0)
    };

    return payload;
  });

  const aristas = editor.getConnections().map((edge) => ({
    origenNodoId: edge.source,
    destinoNodoId: edge.target
  }));

  return { nodos, aristas };
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
