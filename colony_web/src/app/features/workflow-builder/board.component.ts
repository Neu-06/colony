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
import { Arista, NodoCanvas, Swimlane } from '../../core/models/canvas.models';
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
  readonly selectedEdge = this.canvasState.aristaSeleccionada;
  readonly zoomLevel = this.canvasState.zoomLevel;

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
  private resizeObserver: ResizeObserver | null = null;
  private readonly initializedEndpointKinds = new Map<string, string>();
  private syncingFromState = false;

  constructor() {
    effect(() => {
      this.swimlanes();
      this.nodos();
      this.aristas();
      this.selectedEdge();
      this.zoomLevel();
      this.scheduleBoardSync();
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
    this.initializeResizeObserver();
    this.viewReady = true;
    this.scheduleBoardSync();
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

  allowDrop(event: DragEvent): void {
    event.preventDefault();
  }

  onDrop(event: DragEvent, carril: Swimlane): void {
    event.preventDefault();

    const dataTransfer = event.dataTransfer;
    if (!dataTransfer) {
      return;
    }

    const dropzone = event.currentTarget as HTMLElement | null;
    if (!dropzone) {
      return;
    }

    const existingRaw = dataTransfer.getData(this.existingNodeDragMimeType);
    if (existingRaw) {
      this.handleExistingNodeDrop(existingRaw, event, carril.id, dropzone);
      return;
    }

    const dragType = dataTransfer.getData(this.dragMimeType) || dataTransfer.getData('text/plain');
    const toolType = this.mapDragTypeToNodeType(dragType);
    if (!toolType) {
      return;
    }

    const nodeSize = this.resolveNodeSize(toolType);
    const position = this.resolveDropPositionByOffset(event, dropzone, nodeSize);

    const createdNode = this.canvasState.addNode(toolType, carril.id, position);
    (createdNode as NodoCanvas & { departamento?: string }).departamento = carril.nombre;
    this.scheduleBoardSync();
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
    this.canvasState.clearAristaSeleccionada();
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.scheduleBoardSync();
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

    event.preventDefault();

    const selectedNode = this.selectedNode();
    if (selectedNode) {
      this.deleteSelectedNode();
      return;
    }

    const selectedEdge = this.selectedEdge();
    if (selectedEdge) {
      this.canvasState.removeConnection(selectedEdge.origenNodoId, selectedEdge.destinoNodoId);
      this.scheduleBoardSync();
    }
  }

  deleteSelectedNode(): void {
    const node = this.selectedNode();
    if (!node) {
      return;
    }

    this.canvasState.removeNode(node.idNodo);
    this.scheduleBoardSync();
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
    this.scheduleBoardSync();
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
    const zoom = this.zoomLevel();
    const localX = (event.clientX - rect.left) / zoom;
    const localY = (event.clientY - rect.top) / zoom;
    const rawX = localX - pointerOffsetX;
    const rawY = localY - pointerOffsetY;

    const maxX = Math.max(0, dropzone.clientWidth - nodeSize.width);
    const maxY = Math.max(0, dropzone.clientHeight - nodeSize.height);

    return {
      x: Math.min(Math.max(rawX, 0), maxX),
      y: Math.min(Math.max(rawY, 0), maxY)
    };
  }

  private resolveDropPositionByOffset(event: DragEvent, dropzone: HTMLElement, nodeSize: NodeSize): { x: number; y: number } {
    const rect = dropzone.getBoundingClientRect();
    const zoom = this.zoomLevel();
    const localX = (event.clientX - rect.left) / zoom;
    const localY = (event.clientY - rect.top) / zoom;

    const rawX = localX - nodeSize.width / 2;
    const rawY = localY - nodeSize.height / 2;

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
    this.bindJsPlumbEvents();
  }

  private applyJsPlumbDefaults(): void {
    if (!this.jsPlumbInstance) {
      return;
    }

    this.jsPlumbInstance.importDefaults({
      Connector: ['Flowchart', { stub: 24, gap: 10, cornerRadius: 5 }],
      PaintStyle: { stroke: '#475569', strokeWidth: 2 },
      Endpoint: 'Blank',
      ConnectionOverlays: [
        ['Arrow', { location: 1, width: 10, length: 10 }],
        ['Label', { id: 'label', label: '', cssClass: 'wf-edge-label' }]
      ]
    });
  }

  private bindJsPlumbEvents(): void {
    if (!this.jsPlumbInstance) {
      return;
    }

    this.jsPlumbInstance.bind('connection', (info: any) => {
      if (this.syncingFromState) {
        return;
      }

      const sourceNodeId = this.extractNodeId(info?.sourceId);
      const targetNodeId = this.extractNodeId(info?.targetId);
      if (!sourceNodeId || !targetNodeId) {
        return;
      }

      const created = this.canvasState.connectNodes(sourceNodeId, targetNodeId);
      if (!created) {
        this.jsPlumbInstance.deleteConnection(info.connection);
        return;
      }

      this.applyConnectionLabel(info.connection, created.etiqueta ?? '');
      this.canvasState.setAristaSeleccionada(sourceNodeId, targetNodeId);
      this.scheduleBoardSync();
    });

    this.jsPlumbInstance.bind('click', (connection: any, originalEvent?: MouseEvent) => {
      originalEvent?.stopPropagation();

      const sourceNodeId = this.extractNodeId(connection?.sourceId);
      const targetNodeId = this.extractNodeId(connection?.targetId);
      if (!sourceNodeId || !targetNodeId) {
        return;
      }

      this.canvasState.setAristaSeleccionada(sourceNodeId, targetNodeId);
      this.scheduleBoardSync();
    });
  }

  private syncNodeEndpoints(): void {
    if (!this.jsPlumbInstance) {
      return;
    }

    const activeNodeIds = new Set(this.nodos().map((node) => node.idNodo));
    for (const nodeId of this.initializedEndpointKinds.keys()) {
      if (!activeNodeIds.has(nodeId)) {
        this.initializedEndpointKinds.delete(nodeId);
      }
    }

    for (const node of this.nodos()) {
      const endpointKind = this.resolveEndpointKind(node);
      if (this.initializedEndpointKinds.get(node.idNodo) === endpointKind) {
        continue;
      }

      this.initNodeEndpoints(node.idNodo, endpointKind);
      this.initializedEndpointKinds.set(node.idNodo, endpointKind);
    }
  }

  private initNodeEndpoints(nodeId: string, endpointKind: 'INICIO' | 'FIN' | 'TAREA' | 'COMPUERTA'): void {
    if (!this.jsPlumbInstance) {
      return;
    }

    const elementId = this.nodeElementId(nodeId);
    if (!document.getElementById(elementId)) {
      return;
    }

    this.jsPlumbInstance.unmakeSource(elementId);
    this.jsPlumbInstance.unmakeTarget(elementId);

    const policy = this.getEndpointPolicy(endpointKind);

    if (policy.sourceMax !== null) {
      this.jsPlumbInstance.makeSource(elementId, {
        anchor: 'Continuous',
        endpoint: 'Blank',
        maxConnections: policy.sourceMax,
        allowLoopback: false,
        connector: ['Flowchart', { stub: 24, gap: 10, cornerRadius: 5 }],
        connectorStyle: { stroke: '#475569', strokeWidth: 2 },
        connectorOverlays: [
          ['Arrow', { location: 1, width: 10, length: 10 }],
          ['Label', { id: 'label', label: '', cssClass: 'wf-edge-label' }]
        ]
      });
    }

    if (policy.targetMax !== null) {
      this.jsPlumbInstance.makeTarget(elementId, {
        anchor: 'Continuous',
        endpoint: 'Blank',
        maxConnections: policy.targetMax,
        allowLoopback: false
      });
    }
  }

  private getEndpointPolicy(endpointKind: 'INICIO' | 'FIN' | 'TAREA' | 'COMPUERTA'): {
    sourceMax: number | null;
    targetMax: number | null;
  } {
    switch (endpointKind) {
      case 'INICIO':
        return { sourceMax: 1, targetMax: null };
      case 'FIN':
        return { sourceMax: null, targetMax: -1 };
      case 'COMPUERTA':
        return { sourceMax: -1, targetMax: -1 };
      case 'TAREA':
      default:
        return { sourceMax: 1, targetMax: -1 };
    }
  }

  private resolveEndpointKind(node: NodoCanvas): 'INICIO' | 'FIN' | 'TAREA' | 'COMPUERTA' {
    if (node.tipo === 'start') {
      return 'INICIO';
    }

    if (node.tipo === 'end') {
      return 'FIN';
    }

    if (node.tipo === 'compuerta' || node.tipo === 'gateway') {
      return 'COMPUERTA';
    }

    return 'TAREA';
  }

  private drawConnections(): void {
    if (!this.jsPlumbInstance) {
      return;
    }

    this.syncingFromState = true;
    try {
      this.jsPlumbInstance.deleteEveryConnection();

      for (const arista of this.aristas()) {
        const sourceId = this.nodeElementId(arista.origenNodoId);
        const targetId = this.nodeElementId(arista.destinoNodoId);

        if (!document.getElementById(sourceId) || !document.getElementById(targetId)) {
          continue;
        }

        const connection = this.jsPlumbInstance.connect({
          source: sourceId,
          target: targetId,
          anchors: ['Continuous', 'Continuous']
        });

        if (!connection) {
          continue;
        }

        this.applyConnectionLabel(connection, arista.etiqueta ?? '');
        this.applyConnectionSelectionStyle(connection, arista);
      }
    } finally {
      this.syncingFromState = false;
    }

    this.syncJsPlumbZoom();
    this.refreshResizeObserverTargets();
    this.jsPlumbInstance.repaintEverything();
  }

  private applyConnectionLabel(connection: any, label: string): void {
    const overlay = connection.getOverlay('label');
    if (!overlay) {
      return;
    }

    overlay.setLabel(label || '');
  }

  private applyConnectionSelectionStyle(connection: any, edge: Arista): void {
    const selectedEdge = this.selectedEdge();
    const isSelected =
      !!selectedEdge &&
      selectedEdge.origenNodoId === edge.origenNodoId &&
      selectedEdge.destinoNodoId === edge.destinoNodoId;

    connection.setPaintStyle({
      stroke: isSelected ? '#1d4ed8' : '#475569',
      strokeWidth: isSelected ? 3 : 2
    });
  }

  private syncJsPlumbZoom(): void {
    if (!this.jsPlumbInstance) {
      return;
    }

    this.jsPlumbInstance.setZoom(this.zoomLevel());
  }

  private initializeResizeObserver(): void {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    this.resizeObserver = new ResizeObserver(() => {
      if (!this.jsPlumbInstance) {
        return;
      }

      this.jsPlumbInstance.repaintEverything();
    });

    this.refreshResizeObserverTargets();
  }

  private refreshResizeObserverTargets(): void {
    if (!this.resizeObserver) {
      return;
    }

    this.resizeObserver.disconnect();
    this.resizeObserver.observe(this.boardSurfaceRef.nativeElement);

    this.boardSurfaceRef.nativeElement
      .querySelectorAll<HTMLElement>('[data-lane-dropzone], [data-node-card]')
      .forEach((element) => this.resizeObserver?.observe(element));
  }

  private extractNodeId(elementId: string | undefined): string | null {
    if (!elementId || !elementId.startsWith('node-')) {
      return null;
    }

    return elementId.slice(5);
  }

  private scheduleBoardSync(): void {
    if (!this.viewReady || !this.jsPlumbInstance) {
      return;
    }

    if (this.redrawHandle !== null) {
      cancelAnimationFrame(this.redrawHandle);
    }

    this.redrawHandle = requestAnimationFrame(() => {
      this.redrawHandle = null;
      this.syncNodeEndpoints();
      this.drawConnections();
    });
  }

  private destroyJsPlumb(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    if (!this.jsPlumbInstance) {
      return;
    }

    this.jsPlumbInstance.reset();
    if (typeof this.jsPlumbInstance.destroy === 'function') {
      this.jsPlumbInstance.destroy();
    }

    this.jsPlumbInstance = null;
  }
}
