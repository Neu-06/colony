import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  ViewChild,
  computed,
  effect,
  inject,
  signal
} from '@angular/core';
import { jsPlumb } from 'jsplumb';
import { NodoCanvas } from '../../core/models/canvas.models';
import { CanvasStateService, ToolNodeType } from './services/canvas-state.service';

interface NodeSize {
  width: number;
  height: number;
}

interface ExistingNodeDragPayload {
  idNodo: string;
  offsetX: number;
  offsetY: number;
}

@Component({
  selector: 'app-board',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './board.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BoardComponent implements AfterViewInit {
  private readonly canvasState = inject(CanvasStateService);
  private readonly destroyRef = inject(DestroyRef);

  @ViewChild('boardSurface', { static: true })
  private boardSurfaceRef!: ElementRef<HTMLElement>;

  readonly swimlanes = this.canvasState.swimlanes;
  readonly nodos = this.canvasState.nodos;
  readonly aristas = this.canvasState.aristas;
  readonly selectedNode = this.canvasState.nodoSeleccionado;

  readonly editingLaneId = signal<string | null>(null);

  readonly nodesByLane = computed(() => {
    const grouped = new Map<string, NodoCanvas[]>();

    for (const lane of this.swimlanes()) {
      grouped.set(lane.id, []);
    }

    for (const nodo of this.nodos()) {
      const laneNodes = grouped.get(nodo.swimlaneId) ?? [];
      laneNodes.push(nodo);
      grouped.set(nodo.swimlaneId, laneNodes);
    }

    return grouped;
  });

  private readonly dragMimeType = 'application/x-canvas-node';
  private readonly existingNodeDragMimeType = 'application/x-canvas-existing-node';

  private jsPlumbInstance: any = null;
  private viewReady = false;
  private redrawHandle: number | null = null;

  constructor() {
    effect(() => {
      this.swimlanes();
      this.nodos();
      this.aristas();
      this.scheduleConnectionsRedraw();
    });

    this.destroyRef.onDestroy(() => {
      this.destroyJsPlumb();
      if (this.redrawHandle !== null) {
        cancelAnimationFrame(this.redrawHandle);
        this.redrawHandle = null;
      }
    });
  }

  ngAfterViewInit(): void {
    this.initializeJsPlumb();
    this.viewReady = true;
    this.scheduleConnectionsRedraw();
  }

  addLane(): void {
    this.canvasState.addSwimlane();
  }

  removeLane(laneId: string): void {
    this.canvasState.removeSwimlane(laneId);
  }

  startLaneEdit(laneId: string): void {
    this.editingLaneId.set(laneId);
  }

  finishLaneEdit(laneId: string, value: string): void {
    this.canvasState.updateSwimlaneName(laneId, value);
    this.editingLaneId.set(null);
  }

  getNodesForLane(laneId: string): NodoCanvas[] {
    return this.nodesByLane().get(laneId) ?? [];
  }

  nodeElementId(nodeId: string): string {
    return `node-${nodeId}`;
  }

  isSelected(nodeId: string): boolean {
    return this.selectedNode()?.idNodo === nodeId;
  }

  nodeType(node: NodoCanvas): 'start' | 'end' | 'gateway' | 'task' {
    if (node.tipo === 'compuerta' || node.tipo === 'gateway') {
      return 'gateway';
    }

    if (node.tipo === 'start') {
      return 'start';
    }

    if (node.tipo === 'end') {
      return 'end';
    }

    return 'task';
  }

  nodeLabel(node: NodoCanvas): string {
    const type = this.nodeType(node);

    if (type === 'gateway') {
      return (node as { condicionLogica?: string }).condicionLogica?.trim() || 'Compuerta';
    }

    if (type === 'task') {
      return (node as { nombre?: string }).nombre?.trim() || 'Tarea';
    }

    return (node as { nombre?: string }).nombre?.trim() || (type === 'start' ? 'Inicio' : 'Fin');
  }

  onLaneDragOver(event: DragEvent): void {
    const types = event.dataTransfer?.types;
    if (!types) {
      return;
    }

    const accepted = Array.from(types).some(
      (mime) => mime === this.dragMimeType || mime === this.existingNodeDragMimeType || mime === 'text/plain'
    );

    if (!accepted) {
      return;
    }

    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  onLaneDrop(event: DragEvent, laneId: string, dropzone: HTMLElement): void {
    event.preventDefault();

    const dataTransfer = event.dataTransfer;
    if (!dataTransfer) {
      return;
    }

    const existingRaw = dataTransfer.getData(this.existingNodeDragMimeType);
    if (existingRaw) {
      this.handleExistingNodeDrop(existingRaw, event, laneId, dropzone);
      return;
    }

    const dragType = dataTransfer.getData(this.dragMimeType) || dataTransfer.getData('text/plain');
    const toolType = this.mapDragTypeToNodeType(dragType);
    if (!toolType) {
      return;
    }

    const nodeSize = this.resolveNodeSize(toolType);
    const position = this.resolveDropPosition(event, dropzone, nodeSize, nodeSize.width / 2, nodeSize.height / 2);

    this.canvasState.addNode(toolType, laneId, position);
    this.scheduleConnectionsRedraw();
  }

  onNodeDragStart(event: DragEvent, node: NodoCanvas): void {
    if (!event.dataTransfer) {
      return;
    }

    const target = event.currentTarget as HTMLElement | null;
    const rect = target?.getBoundingClientRect();

    const payload: ExistingNodeDragPayload = {
      idNodo: node.idNodo,
      offsetX: rect ? event.clientX - rect.left : this.resolveNodeSize(this.nodeType(node)).width / 2,
      offsetY: rect ? event.clientY - rect.top : this.resolveNodeSize(this.nodeType(node)).height / 2
    };

    event.dataTransfer.setData(this.existingNodeDragMimeType, JSON.stringify(payload));
    event.dataTransfer.effectAllowed = 'move';
  }

  onNodeClick(node: NodoCanvas, event: MouseEvent): void {
    event.stopPropagation();
    this.canvasState.setNodoSeleccionado(node.idNodo);
  }

  clearSelection(event: MouseEvent): void {
    const target = event.target as HTMLElement;

    if (target.closest('[data-node-card], button, input, textarea, select, [data-lane-header]')) {
      return;
    }

    this.canvasState.setNodoSeleccionado(null);
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.scheduleConnectionsRedraw();
  }

  @HostListener('window:keydown', ['$event'])
  onWindowKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Delete' && event.key !== 'Backspace') {
      return;
    }

    const active = document.activeElement as HTMLElement | null;
    if (active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)) {
      return;
    }

    if (!this.selectedNode()) {
      return;
    }

    event.preventDefault();
    this.deleteSelectedNode();
  }

  deleteSelectedNode(): void {
    const node = this.selectedNode();
    if (!node) {
      return;
    }

    this.canvasState.removeNode(node.idNodo);
    this.scheduleConnectionsRedraw();
  }

  private handleExistingNodeDrop(rawPayload: string, event: DragEvent, laneId: string, dropzone: HTMLElement): void {
    let payload: ExistingNodeDragPayload | null = null;

    try {
      payload = JSON.parse(rawPayload) as ExistingNodeDragPayload;
    } catch {
      payload = null;
    }

    if (!payload?.idNodo) {
      return;
    }

    const node = this.nodos().find((item) => item.idNodo === payload.idNodo);
    if (!node) {
      return;
    }

    const nodeSize = this.resolveNodeSize(this.nodeType(node));
    const position = this.resolveDropPosition(
      event,
      dropzone,
      nodeSize,
      Number.isFinite(payload.offsetX) ? payload.offsetX : nodeSize.width / 2,
      Number.isFinite(payload.offsetY) ? payload.offsetY : nodeSize.height / 2
    );

    this.canvasState.updateNode(node.idNodo, {
      swimlaneId: laneId,
      posicion: position
    });

    this.canvasState.setNodoSeleccionado(node.idNodo);
    this.scheduleConnectionsRedraw();
  }

  private mapDragTypeToNodeType(dragType: unknown): ToolNodeType | null {
    switch (dragType) {
      case 'INICIO':
        return 'start';
      case 'TAREA':
        return 'task';
      case 'COMPUERTA':
        return 'gateway';
      case 'FIN':
        return 'end';
      default:
        return null;
    }
  }

  private resolveDropPosition(
    event: DragEvent,
    dropzone: HTMLElement,
    nodeSize: NodeSize,
    pointerOffsetX: number,
    pointerOffsetY: number
  ): { x: number; y: number } {
    const rect = dropzone.getBoundingClientRect();
    const rawX = event.clientX - rect.left - pointerOffsetX;
    const rawY = event.clientY - rect.top - pointerOffsetY;

    const maxX = Math.max(0, dropzone.clientWidth - nodeSize.width);
    const maxY = Math.max(0, dropzone.clientHeight - nodeSize.height);

    return {
      x: Math.min(Math.max(rawX, 0), maxX),
      y: Math.min(Math.max(rawY, 0), maxY)
    };
  }

  private resolveNodeSize(type: ToolNodeType | 'start' | 'end' | 'gateway' | 'task'): NodeSize {
    if (type === 'gateway') {
      return { width: 80, height: 80 };
    }

    if (type === 'start' || type === 'end') {
      return { width: 48, height: 48 };
    }

    return { width: 128, height: 64 };
  }

  private initializeJsPlumb(): void {
    const container = this.boardSurfaceRef.nativeElement;

    this.jsPlumbInstance = jsPlumb.getInstance({
      Container: container
    });

    this.applyJsPlumbDefaults();
  }

  private applyJsPlumbDefaults(): void {
    if (!this.jsPlumbInstance) {
      return;
    }

    this.jsPlumbInstance.importDefaults({
      Connector: ['Flowchart', { stub: 24, gap: 10, cornerRadius: 5 }],
      PaintStyle: { stroke: '#475569', strokeWidth: 2 },
      Endpoint: 'Blank'
    });
  }

  private drawConnections(): void {
    if (!this.jsPlumbInstance) {
      return;
    }

    const container = this.boardSurfaceRef.nativeElement;

    this.jsPlumbInstance.reset();
    this.jsPlumbInstance.setContainer(container);
    this.applyJsPlumbDefaults();

    for (const arista of this.aristas()) {
      const sourceId = this.nodeElementId(arista.origenNodoId);
      const targetId = this.nodeElementId(arista.destinoNodoId);

      if (!document.getElementById(sourceId) || !document.getElementById(targetId)) {
        continue;
      }

      this.jsPlumbInstance.connect({
        source: sourceId,
        target: targetId,
        anchors: ['Continuous', 'Continuous'],
        overlays: [['Arrow', { location: 1, width: 10, length: 10 }]]
      });
    }

    this.jsPlumbInstance.repaintEverything();
  }

  private scheduleConnectionsRedraw(): void {
    if (!this.viewReady || !this.jsPlumbInstance) {
      return;
    }

    if (this.redrawHandle !== null) {
      cancelAnimationFrame(this.redrawHandle);
    }

    this.redrawHandle = requestAnimationFrame(() => {
      this.redrawHandle = null;
      this.drawConnections();
    });
  }

  private destroyJsPlumb(): void {
    if (!this.jsPlumbInstance) {
      return;
    }

    this.jsPlumbInstance.reset();
    this.jsPlumbInstance = null;
  }
}
