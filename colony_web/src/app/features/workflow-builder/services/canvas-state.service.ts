import { Injectable, computed, signal } from '@angular/core';
import { Arista, CampoForm, NodoActividad, NodoBase, NodoCanvas, NodoCompuerta, PoliticaNegocio, Swimlane } from '../../../core/models/canvas.models';
import {
  WorkflowGraphSnapshot,
  fromPoliticaToWorkflowGraph,
  toPoliticaFromWorkflowGraph
} from '../rete-backend.adapter';

export type ToolNodeType = 'start' | 'task' | 'gateway' | 'end';

@Injectable({
  providedIn: 'root'
})
export class CanvasStateService {
  private readonly nodeSequence = signal(0);
  private readonly laneSequence = signal(1);
  private readonly _activePolicyId = signal<string | null>(null);

  private readonly _swimlanes = signal<Swimlane[]>([
    { id: 'lane-1', nombre: 'Nueva Calle', orden: 1 }
  ]);
  private readonly _nodos = signal<NodoCanvas[]>([]);
  private readonly _aristas = signal<Arista[]>([]);
  private readonly _selectedNodeId = signal<string | null>(null);
  private readonly _pendingConnectionOriginId = signal<string | null>(null);

  readonly swimlanes = this._swimlanes.asReadonly();
  readonly nodos = this._nodos.asReadonly();
  readonly aristas = this._aristas.asReadonly();
  readonly pendingConnectionOriginId = this._pendingConnectionOriginId.asReadonly();
  readonly activePolicyId = this._activePolicyId.asReadonly();

  readonly nodoSeleccionado = computed(() => {
    const selectedId = this._selectedNodeId();
    if (!selectedId) {
      return null;
    }
    return this._nodos().find((node) => node.idNodo === selectedId) ?? null;
  });

  addSwimlane(): void {
    const nextOrder = this._swimlanes().length + 1;
    const nextLaneId = this.nextLaneId();

    this._swimlanes.update((current) => [
      ...current,
      {
        id: nextLaneId,
        nombre: `Departamento ${nextOrder}`,
        orden: nextOrder
      }
    ]);
  }

  removeSwimlane(swimlaneId: string): void {
    const lanes = this._swimlanes();
    if (lanes.length <= 1) {
      return;
    }

    const fallbackLaneId = lanes.find((lane) => lane.id !== swimlaneId)?.id;
    if (!fallbackLaneId) {
      return;
    }

    this._swimlanes.set(
      lanes
        .filter((lane) => lane.id !== swimlaneId)
        .map((lane, index) => ({ ...lane, orden: index + 1 }))
    );

    this._nodos.update((current) =>
      current.map((node) =>
        node.swimlaneId === swimlaneId
          ? {
              ...node,
              swimlaneId: fallbackLaneId
            }
          : node
      )
    );
  }

  updateSwimlaneName(swimlaneId: string, name: string): void {
    this._swimlanes.update((current) =>
      current.map((lane) =>
        lane.id === swimlaneId
          ? {
              ...lane,
              nombre: name.trim() || lane.nombre
            }
          : lane
      )
    );
  }

  addNode(type: ToolNodeType, swimlaneId: string, posicion: { x: number; y: number }): NodoCanvas {
    const nodeId = this.nextNodeId(type);
    const node = this.buildNode(type, nodeId, swimlaneId, posicion);

    this._nodos.update((current) => [...current, node]);
    this._selectedNodeId.set(node.idNodo);

    return node;
  }

  updateNode(nodeId: string, patch: Partial<NodoActividad & NodoCompuerta & NodoBase>): void {
    this._nodos.update((current) =>
      current.map((node) =>
        node.idNodo === nodeId
          ? {
              ...node,
              ...patch,
              posicion: patch.posicion
                ? {
                    x: patch.posicion.x,
                    y: patch.posicion.y
                  }
                : node.posicion
            }
          : node
      )
    );
  }

  removeNode(nodeId: string): void {
    this._nodos.update((current) => current.filter((node) => node.idNodo !== nodeId));
    this._aristas.update((current) =>
      current.filter((edge) => edge.origenNodoId !== nodeId && edge.destinoNodoId !== nodeId)
    );

    if (this._selectedNodeId() === nodeId) {
      this._selectedNodeId.set(null);
    }

    if (this._pendingConnectionOriginId() === nodeId) {
      this._pendingConnectionOriginId.set(null);
    }
  }

  connectNodes(origenNodoId: string, destinoNodoId: string): void {
    if (origenNodoId === destinoNodoId) {
      return;
    }

    const alreadyExists = this._aristas().some(
      (edge) => edge.origenNodoId === origenNodoId && edge.destinoNodoId === destinoNodoId
    );

    if (alreadyExists) {
      return;
    }

    this._aristas.update((current) => [...current, { origenNodoId, destinoNodoId }]);
  }

  removeConnection(origenNodoId: string, destinoNodoId: string): void {
    this._aristas.update((current) =>
      current.filter(
        (edge) => !(edge.origenNodoId === origenNodoId && edge.destinoNodoId === destinoNodoId)
      )
    );
  }

  setNodoSeleccionado(nodeId: string | null): void {
    this._selectedNodeId.set(nodeId);
  }

  setPendingConnectionOrigin(nodeId: string | null): void {
    this._pendingConnectionOriginId.set(nodeId);
  }

  hydrateFromPolitica(politica: PoliticaNegocio): void {
    const graph = fromPoliticaToWorkflowGraph(politica);

    this._activePolicyId.set(politica.id ?? null);
    this._nodos.set(graph.nodos.map((node) => this.normalizeNode(node)));
    this._aristas.set(graph.aristas);
    this._selectedNodeId.set(null);
    this._pendingConnectionOriginId.set(null);
    this.recomputeSequences();
  }

  syncGraphSnapshot(snapshot: WorkflowGraphSnapshot): void {
    this._nodos.set(snapshot.nodos.map((node) => this.normalizeNode(node)));
    this._aristas.set(snapshot.aristas.map((edge) => ({ ...edge })));

    const selectedId = this._selectedNodeId();
    if (selectedId && !snapshot.nodos.some((node) => node.idNodo === selectedId)) {
      this._selectedNodeId.set(null);
    }

    this.recomputeSequences();
  }

  resetCanvas(): void {
    this._activePolicyId.set(null);
    this._swimlanes.set([{ id: 'lane-1', nombre: 'Nueva Calle', orden: 1 }]);
    this._nodos.set([]);
    this._aristas.set([]);
    this._selectedNodeId.set(null);
    this._pendingConnectionOriginId.set(null);
    this.nodeSequence.set(0);
    this.laneSequence.set(1);
  }

  toPoliticaNegocio(nombre: string, estado: string, version = 1): PoliticaNegocio {
    return toPoliticaFromWorkflowGraph(
      {
        nodos: this._nodos().map((node) => this.normalizeNode(node)),
        aristas: this._aristas().map((edge) => ({ ...edge }))
      },
      {
        id: this._activePolicyId() ?? undefined,
        nombre: nombre.trim() || 'Flujo sin nombre',
        estado,
        version
      }
    );
  }

  private buildNode(type: ToolNodeType, idNodo: string, swimlaneId: string, posicion: { x: number; y: number }): NodoCanvas {
    const safePosition = { x: Math.max(posicion.x, 0), y: Math.max(posicion.y, 0) };

    if (type === 'gateway') {
      return {
        idNodo,
        tipo: 'compuerta',
        posicion: safePosition,
        swimlaneId,
        condicionLogica: ''
      };
    }

    const activityType = type === 'task' ? 'task' : type;

    return {
      idNodo,
      tipo: activityType,
      posicion: safePosition,
      swimlaneId,
      nombre: this.resolveActivityName(type),
      esquemaFormulario: [] as CampoForm[]
    };
  }

  private resolveActivityName(type: ToolNodeType): string {
    switch (type) {
      case 'start':
        return 'Inicio';
      case 'end':
        return 'Fin';
      case 'task':
      default:
        return 'Nueva Tarea';
    }
  }

  private nextNodeId(prefix: string): string {
    const next = this.nodeSequence() + 1;
    this.nodeSequence.set(next);
    return `${prefix}-${next}`;
  }

  private nextLaneId(): string {
    const next = this.laneSequence() + 1;
    this.laneSequence.set(next);
    return `lane-${next}`;
  }

  private normalizeNode(node: NodoCanvas): NodoCanvas {
    if (this.isActividad(node)) {
      return {
        idNodo: node.idNodo,
        tipo: node.tipo,
        posicion: {
          x: Number(node.posicion?.x ?? 0),
          y: Number(node.posicion?.y ?? 0)
        },
        swimlaneId: node.swimlaneId || this._swimlanes()[0]?.id || 'lane-1',
        nombre: node.nombre || 'Nueva Tarea',
        esquemaFormulario: (node.esquemaFormulario ?? []).map((field) => ({
          nombre: field.nombre ?? '',
          tipo: field.tipo ?? 'Texto',
          requerido: !!field.requerido
        }))
      };
    }

    return {
      idNodo: node.idNodo,
      tipo: node.tipo,
      posicion: {
        x: Number(node.posicion?.x ?? 0),
        y: Number(node.posicion?.y ?? 0)
      },
      swimlaneId: node.swimlaneId || this._swimlanes()[0]?.id || 'lane-1',
      condicionLogica: node.condicionLogica ?? ''
    };
  }

  private isActividad(node: NodoCanvas): node is NodoActividad {
    return node.tipo !== 'compuerta' && node.tipo !== 'gateway';
  }

  private recomputeSequences(): void {
    const maxNode = this._nodos().reduce((max, node) => {
      const suffix = Number(node.idNodo.split('-').pop() ?? '0');
      return Number.isFinite(suffix) ? Math.max(max, suffix) : max;
    }, 0);

    this.nodeSequence.set(maxNode);

    const maxLane = this._swimlanes().reduce((max, lane) => {
      const suffix = Number(lane.id.split('-').pop() ?? '0');
      return Number.isFinite(suffix) ? Math.max(max, suffix) : max;
    }, 1);

    this.laneSequence.set(maxLane);
  }
}
