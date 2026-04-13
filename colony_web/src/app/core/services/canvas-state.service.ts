import { Injectable, WritableSignal, computed, signal } from '@angular/core';

export type CanvasNodeType = 'start' | 'task' | 'gateway' | 'end';

export interface CanvasTool {
  type: CanvasNodeType;
  label: string;
  description: string;
}

export interface CanvasLane {
  id: string;
  title: string;
}

export interface CanvasNode {
  id: string;
  type: CanvasNodeType;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  laneId: string;
  createdAt: number;
}

export interface CanvasEdge {
  id: string;
  sourceId: string;
  targetId: string;
}

interface CanvasBounds {
  width: number;
  height: number;
}

interface CanvasPosition {
  x: number;
  y: number;
}

@Injectable({
  providedIn: 'root'
})
export class CanvasStateService {
  private readonly idSequence: WritableSignal<number> = signal(0);

  private readonly _tools = signal<CanvasTool[]>([
    { type: 'start', label: 'Inicio', description: 'Punto inicial del flujo' },
    { type: 'task', label: 'Tarea', description: 'Actividad de negocio' },
    { type: 'gateway', label: 'Compuerta', description: 'Decision o bifurcacion' },
    { type: 'end', label: 'Fin', description: 'Cierre del proceso' }
  ]);

  private readonly _lanes = signal<CanvasLane[]>([
    { id: 'lane-ops', title: 'Operaciones' },
    { id: 'lane-fin', title: 'Finanzas' },
    { id: 'lane-qa', title: 'Calidad' },
    { id: 'lane-admin', title: 'Administracion' }
  ]);

  private readonly _nodes = signal<CanvasNode[]>([]);

  readonly tools = this._tools.asReadonly();
  readonly lanes = this._lanes.asReadonly();
  readonly nodes = this._nodes.asReadonly();

  readonly edges = computed<CanvasEdge[]>(() => {
    const orderedNodes = [...this._nodes()].sort((a, b) => a.createdAt - b.createdAt);
    const nextEdges: CanvasEdge[] = [];

    for (let index = 1; index < orderedNodes.length; index += 1) {
      const source = orderedNodes[index - 1];
      const target = orderedNodes[index];
      nextEdges.push({
        id: `edge-${source.id}-${target.id}`,
        sourceId: source.id,
        targetId: target.id
      });
    }

    return nextEdges;
  });

  addNodeFromTool(type: CanvasNodeType, dropPosition: CanvasPosition, bounds: CanvasBounds): void {
    const size = this.resolveNodeSize(type);
    const clampedPosition = this.clampToBoard(
      {
        x: dropPosition.x - size.width / 2,
        y: dropPosition.y - size.height / 2
      },
      size,
      bounds
    );

    const laneId = this.resolveLaneForY(clampedPosition.y, size.height, bounds.height);
    const nextId = this.nextNodeId(type);

    const nextNode: CanvasNode = {
      id: nextId,
      type,
      label: this.resolveLabel(type),
      x: clampedPosition.x,
      y: clampedPosition.y,
      width: size.width,
      height: size.height,
      laneId,
      createdAt: Date.now()
    };

    this._nodes.update((current) => [...current, nextNode]);
  }

  updateNodePosition(nodeId: string, nextPosition: CanvasPosition, bounds: CanvasBounds): void {
    this._nodes.update((current) =>
      current.map((node) => {
        if (node.id !== nodeId) {
          return node;
        }

        const clampedPosition = this.clampToBoard(nextPosition, { width: node.width, height: node.height }, bounds);
        const laneId = this.resolveLaneForY(clampedPosition.y, node.height, bounds.height);

        return {
          ...node,
          x: clampedPosition.x,
          y: clampedPosition.y,
          laneId
        };
      })
    );
  }

  clearCanvas(): void {
    this._nodes.set([]);
  }

  getGraphSnapshot(): { lanes: CanvasLane[]; nodes: CanvasNode[]; edges: CanvasEdge[] } {
    return {
      lanes: this._lanes(),
      nodes: this._nodes(),
      edges: this.edges()
    };
  }

  logGraphSnapshot(): void {
    console.log('Grafo del canvas:', this.getGraphSnapshot());
  }

  private nextNodeId(type: CanvasNodeType): string {
    const value = this.idSequence() + 1;
    this.idSequence.set(value);
    return `${type}-${value}`;
  }

  private resolveLabel(type: CanvasNodeType): string {
    switch (type) {
      case 'start':
        return 'Inicio';
      case 'task':
        return 'Tarea';
      case 'gateway':
        return 'Compuerta';
      case 'end':
        return 'Fin';
      default:
        return 'Nodo';
    }
  }

  private resolveNodeSize(type: CanvasNodeType): { width: number; height: number } {
    switch (type) {
      case 'start':
      case 'end':
        return { width: 56, height: 56 };
      case 'gateway':
        return { width: 72, height: 72 };
      case 'task':
      default:
        return { width: 148, height: 72 };
    }
  }

  private clampToBoard(position: CanvasPosition, size: { width: number; height: number }, bounds: CanvasBounds): CanvasPosition {
    const maxX = Math.max(bounds.width - size.width, 0);
    const maxY = Math.max(bounds.height - size.height, 0);

    return {
      x: Math.min(Math.max(position.x, 0), maxX),
      y: Math.min(Math.max(position.y, 0), maxY)
    };
  }

  private resolveLaneForY(nodeY: number, nodeHeight: number, boardHeight: number): string {
    const lanes = this._lanes();
    if (!lanes.length) {
      return 'lane-default';
    }

    const laneHeight = boardHeight > 0 ? boardHeight / lanes.length : 1;

    // Se usa el centro vertical del nodo para determinar su calle visual mas cercana.
    const centerY = nodeY + nodeHeight / 2;
    const rawIndex = Math.floor(centerY / laneHeight);
    const laneIndex = Math.min(Math.max(rawIndex, 0), lanes.length - 1);

    return lanes[laneIndex].id;
  }
}
