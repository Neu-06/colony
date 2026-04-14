import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  Injector,
  ViewChild,
  computed,
  effect,
  inject,
  signal
} from '@angular/core';
import { NodeEditor } from 'rete';
import { AngularArea2D, AngularPlugin, Presets as AngularPresets } from 'rete-angular-plugin/18';
import { AreaExtensions, AreaPlugin } from 'rete-area-plugin';
import { ConnectionPlugin, Presets as ConnectionPresets } from 'rete-connection-plugin';
import { Arista, NodoCanvas } from '../../core/models/canvas.models';
import { WorkflowNode, WorkflowScheme, createWorkflowConnection, createWorkflowSocket, toWorkflowKind } from './rete-nodes';
import { CanvasStateService, ToolNodeType } from './services/canvas-state.service';

interface NodeSize {
  width: number;
  height: number;
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
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly workflowSocket = createWorkflowSocket();

  @ViewChild('boardScroll', { static: true })
  private boardScrollRef!: ElementRef<HTMLElement>;

  @ViewChild('reteHost', { static: true })
  private reteHostRef!: ElementRef<HTMLElement>;

  readonly swimlanes = this.canvasState.swimlanes;
  readonly nodos = this.canvasState.nodos;
  readonly aristas = this.canvasState.aristas;
  readonly selectedNode = this.canvasState.nodoSeleccionado;
  readonly editorReady = signal(false);
  readonly boardMinHeight = computed(() => Math.max(this.swimlanes().length * 250 + 96, 520));

  readonly editingLaneId = signal<string | null>(null);

  private editor: NodeEditor<WorkflowScheme> | null = null;
  private area: AreaPlugin<WorkflowScheme, AngularArea2D<WorkflowScheme>> | null = null;
  private connection: ConnectionPlugin<WorkflowScheme> | null = null;

  private isSyncingFromState = false;
  private isSyncingFromEditor = false;

  constructor() {
    effect(() => {
      const nodos = this.nodos();
      const aristas = this.aristas();

      if (!this.editorReady() || !this.editor || !this.area || this.isSyncingFromEditor || this.isSyncingFromState) {
        return;
      }

      void this.syncEditorWithState(nodos, aristas);
    });

    this.destroyRef.onDestroy(() => {
      this.disposeEditor();
    });
  }

  async ngAfterViewInit(): Promise<void> {
    await this.initializeEditor();
    this.editorReady.set(true);
    await this.syncEditorWithState(this.nodos(), this.aristas());
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

  onNativeDragOver(event: DragEvent): void {
    const types = event.dataTransfer?.types;
    if (!types) {
      return;
    }

    if (Array.from(types).includes('application/x-canvas-node') || Array.from(types).includes('text/plain')) {
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy';
      }
    }
  }

  onNativeDrop(event: DragEvent): void {
    event.preventDefault();

    const dataTransfer = event.dataTransfer;
    if (!dataTransfer) {
      return;
    }

    const dragType = dataTransfer.getData('application/x-canvas-node') || dataTransfer.getData('text/plain');
    const toolType = this.mapDragTypeToNodeType(dragType);
    if (!toolType) {
      return;
    }

    const boardElement = this.boardScrollRef.nativeElement;
    const boardRect = boardElement.getBoundingClientRect();
    const nodeSize = this.resolveNodeSize(toolType);

    const x = event.clientX - boardRect.left + boardElement.scrollLeft - nodeSize.width / 2;
    const y = event.clientY - boardRect.top + boardElement.scrollTop - nodeSize.height / 2;

    const laneId = this.findLaneIdByRelativeY(y + nodeSize.height / 2) ?? this.swimlanes()[0]?.id;
    if (!laneId) {
      return;
    }

    this.canvasState.addNode(toolType, laneId, {
      x: Math.max(x, 0),
      y: Math.max(y, 0)
    });
  }

  deleteSelectedNode(): void {
    const node = this.selectedNode();
    if (!node) {
      return;
    }

    this.canvasState.removeNode(node.idNodo);
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

  clearSelection(event: MouseEvent): void {
    const target = event.target as HTMLElement;

    if (target.closest('button, input, textarea, select, [data-lane-header]')) {
      return;
    }

    if (target.closest('rete-node, [data-rete-node]')) {
      return;
    }

    this.canvasState.setNodoSeleccionado(null);
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

  private resolveNodeSize(type: string): NodeSize {
    if (type === 'compuerta' || type === 'gateway') {
      return { width: 84, height: 84 };
    }

    if (type === 'start' || type === 'end') {
      return { width: 64, height: 64 };
    }

    return { width: 180, height: 78 };
  }

  private findLaneIdByRelativeY(relativeY: number): string | null {
    const board = this.boardScrollRef.nativeElement;
    const lanes = board.querySelectorAll<HTMLElement>('[data-lane-drop="true"]');

    for (const laneElement of Array.from(lanes)) {
      const top = laneElement.offsetTop;
      const bottom = top + laneElement.offsetHeight;
      if (relativeY >= top && relativeY <= bottom) {
        return laneElement.dataset['laneId'] ?? null;
      }
    }

    return null;
  }

  private async initializeEditor(): Promise<void> {
    const editor = new NodeEditor<WorkflowScheme>();
    const area = new AreaPlugin<WorkflowScheme, AngularArea2D<WorkflowScheme>>(this.reteHostRef.nativeElement);
    const connection = new ConnectionPlugin<WorkflowScheme>();
    const render = new AngularPlugin<WorkflowScheme, AngularArea2D<WorkflowScheme>>({ injector: this.injector });

    render.addPreset(AngularPresets.classic.setup());
    connection.addPreset(ConnectionPresets.classic.setup());

    editor.use(area);
    area.use(connection);
    area.use(render);

    AreaExtensions.simpleNodesOrder(area);
    AreaExtensions.selectableNodes(area, AreaExtensions.selector(), {
      accumulating: AreaExtensions.accumulateOnCtrl()
    });

    area.addPipe((context) => {
      if (!context || typeof context !== 'object' || !('type' in context)) {
        return context;
      }

      if (this.isSyncingFromState) {
        return context;
      }

      if (context.type === 'nodepicked') {
        this.canvasState.setNodoSeleccionado(context.data.id);
        return context;
      }

      if (context.type === 'nodetranslated') {
        const editorNode = editor.getNode(context.data.id) as WorkflowNode | undefined;
        if (!editorNode) {
          return context;
        }

        const size = this.resolveNodeSize(editorNode.payload.tipo);
        const laneId = this.findLaneIdByRelativeY(context.data.position.y + size.height / 2) ?? editorNode.payload.swimlaneId;

        this.isSyncingFromEditor = true;
        try {
          this.canvasState.updateNode(context.data.id, {
            posicion: {
              x: Math.max(context.data.position.x, 0),
              y: Math.max(context.data.position.y, 0)
            },
            swimlaneId: laneId
          });
        } finally {
          this.isSyncingFromEditor = false;
        }

        return context;
      }

      if (context.type === 'connectioncreated') {
        const created = editor.getConnection(context.data.id);
        if (!created) {
          return context;
        }

        this.isSyncingFromEditor = true;
        try {
          this.canvasState.connectNodes(created.source, created.target);
        } finally {
          this.isSyncingFromEditor = false;
        }

        return context;
      }

      if (context.type === 'connectionremoved') {
        const removed = context.data;

        this.isSyncingFromEditor = true;
        try {
          this.canvasState.removeConnection(removed.source, removed.target);
        } finally {
          this.isSyncingFromEditor = false;
        }

        return context;
      }

      return context;
    });

    this.editor = editor;
    this.area = area;
    this.connection = connection;
  }

  private async syncEditorWithState(nodos: NodoCanvas[], aristas: Arista[]): Promise<void> {
    if (!this.editor || !this.area) {
      return;
    }

    this.isSyncingFromState = true;

    try {
      const editor = this.editor;
      const area = this.area;

      const expectedNodes = new Map(nodos.map((node) => [node.idNodo, node]));
      const expectedEdges = new Set(aristas.map((edge) => `${edge.origenNodoId}->${edge.destinoNodoId}`));

      for (const existingConnection of editor.getConnections()) {
        const key = `${existingConnection.source}->${existingConnection.target}`;
        if (!expectedEdges.has(key)) {
          await editor.removeConnection(existingConnection.id);
        }
      }

      for (const existingNode of editor.getNodes()) {
        if (!expectedNodes.has(existingNode.id)) {
          await editor.removeNode(existingNode.id);
        }
      }

      for (const nodePayload of nodos) {
        let editorNode = editor.getNode(nodePayload.idNodo) as WorkflowNode | undefined;
        const expectedKind = toWorkflowKind(nodePayload.tipo);

        if (!editorNode) {
          editorNode = new WorkflowNode(nodePayload, this.workflowSocket);
          await editor.addNode(editorNode);
        } else if (editorNode.kind !== expectedKind) {
          await editor.removeNode(editorNode.id);
          editorNode = new WorkflowNode(nodePayload, this.workflowSocket);
          await editor.addNode(editorNode);
        } else {
          editorNode.syncPayload(nodePayload);
          await area.update('node', editorNode.id);
        }

        await area.translate(editorNode.id, {
          x: Number(nodePayload.posicion.x),
          y: Number(nodePayload.posicion.y)
        });
      }

      for (const edge of aristas) {
        const source = editor.getNode(edge.origenNodoId) as WorkflowNode | undefined;
        const target = editor.getNode(edge.destinoNodoId) as WorkflowNode | undefined;
        if (!source || !target) {
          continue;
        }

        const exists = editor
          .getConnections()
          .some((connection) => connection.source === edge.origenNodoId && connection.target === edge.destinoNodoId);

        if (exists) {
          continue;
        }

        const connection = createWorkflowConnection(source, target);
        if (connection) {
          await editor.addConnection(connection);
        }
      }

    } finally {
      this.isSyncingFromState = false;
    }
  }

  private disposeEditor(): void {
    this.area?.destroy();
    this.editor = null;
    this.area = null;
    this.connection = null;
    this.editorReady.set(false);
  }
}
