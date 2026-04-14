import { ClassicPreset, GetSchemes } from 'rete';
import { CampoForm, NodoActividad, NodoCanvas, NodoCompuerta } from '../../core/models/canvas.models';

export type WorkflowNodeKind = 'start' | 'task' | 'gateway' | 'end';

export class WorkflowNode extends ClassicPreset.Node<{ in?: ClassicPreset.Socket }, { out?: ClassicPreset.Socket }> {
  payload: NodoCanvas;
  kind: WorkflowNodeKind;

  constructor(payload: NodoCanvas, socket: ClassicPreset.Socket) {
    const kind = toWorkflowKind(payload.tipo);
    super(resolveNodeLabel(payload, kind));

    this.payload = cloneNodePayload(payload);
    this.kind = kind;
    this.id = payload.idNodo;

    if (kind !== 'start') {
      this.addInput('in', new ClassicPreset.Input(socket, 'Entrada'));
    }

    if (kind !== 'end') {
      this.addOutput('out', new ClassicPreset.Output(socket, 'Salida'));
    }
  }

  syncPayload(payload: NodoCanvas): void {
    this.payload = cloneNodePayload(payload);
    this.kind = toWorkflowKind(payload.tipo);
    this.label = resolveNodeLabel(payload, this.kind);
  }
}

export type WorkflowConnection = ClassicPreset.Connection<ClassicPreset.Node, ClassicPreset.Node>;
export type WorkflowScheme = GetSchemes<ClassicPreset.Node, WorkflowConnection>;

export function createWorkflowSocket(): ClassicPreset.Socket {
  return new ClassicPreset.Socket('workflow');
}

export function createWorkflowConnection(source: WorkflowNode, target: WorkflowNode): WorkflowConnection | null {
  if (!source.outputs['out'] || !target.inputs['in']) {
    return null;
  }

  return new ClassicPreset.Connection(source, 'out', target, 'in') as WorkflowConnection;
}

export function toWorkflowKind(nodeType: string): WorkflowNodeKind {
  if (nodeType === 'compuerta' || nodeType === 'gateway') {
    return 'gateway';
  }

  if (nodeType === 'start' || nodeType === 'end') {
    return nodeType;
  }

  return 'task';
}

export function isGatewayNode(node: NodoCanvas): node is NodoCompuerta {
  return node.tipo === 'compuerta' || node.tipo === 'gateway';
}

function resolveNodeLabel(node: NodoCanvas, kind: WorkflowNodeKind): string {
  if (kind === 'start') {
    return 'Inicio';
  }

  if (kind === 'end') {
    return 'Fin';
  }

  if (kind === 'gateway') {
    const gatewayNode = node as NodoCompuerta;
    return gatewayNode.condicionLogica?.trim() || 'Compuerta';
  }

  const activityNode = node as NodoActividad;
  return activityNode.nombre?.trim() || 'Nueva Tarea';
}

function cloneNodePayload(node: NodoCanvas): NodoCanvas {
  if (isGatewayNode(node)) {
    return {
      idNodo: node.idNodo,
      tipo: node.tipo,
      posicion: {
        x: Number(node.posicion?.x ?? 0),
        y: Number(node.posicion?.y ?? 0)
      },
      swimlaneId: node.swimlaneId || 'lane-1',
      condicionLogica: node.condicionLogica ?? ''
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
    esquemaFormulario: (activityNode.esquemaFormulario ?? []).map((field: CampoForm) => ({
      nombre: field.nombre ?? '',
      tipo: field.tipo ?? 'Texto',
      requerido: !!field.requerido
    }))
  };
}
