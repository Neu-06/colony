import { CdkDragDrop, CdkDragEnd, DragDropModule } from '@angular/cdk/drag-drop';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, ViewChild, computed, inject } from '@angular/core';
import { CanvasEdge, CanvasNode, CanvasNodeType, CanvasStateService } from '../../core/services/canvas-state.service';

interface PointerPosition {
  x: number;
  y: number;
}

@Component({
  selector: 'app-canvas-board',
  standalone: true,
  imports: [CommonModule, DragDropModule],
  templateUrl: './canvas-board.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CanvasBoardComponent {
  private readonly canvasState = inject(CanvasStateService);

  @ViewChild('canvasBoard', { static: true })
  private canvasBoardRef!: ElementRef<HTMLElement>;

  readonly toolbarDropListId = 'canvas-toolbar-list';
  readonly canvasDropListId = 'canvas-board-list';

  readonly lanes = this.canvasState.lanes;
  readonly nodes = this.canvasState.nodes;
  readonly edges = this.canvasState.edges;

  private readonly nodeMap = computed(() => {
    const map = new Map<string, CanvasNode>();
    for (const node of this.nodes()) {
      map.set(node.id, node);
    }
    return map;
  });

  onDrop(event: CdkDragDrop<CanvasNode[], unknown, CanvasNodeType>): void {
    if (event.previousContainer === event.container) {
      return;
    }

    const toolType = event.item.data as CanvasNodeType | undefined;
    if (!toolType) {
      return;
    }

    const boardRect = this.canvasBoardRef.nativeElement.getBoundingClientRect();
    const pointer = this.resolvePointerPosition(event.event);
    if (!pointer) {
      return;
    }

    // Convertimos coordenadas absolutas del mouse a coordenadas relativas del lienzo.
    const relativeDrop = {
      x: pointer.x - boardRect.left,
      y: pointer.y - boardRect.top
    };

    this.canvasState.addNodeFromTool(toolType, relativeDrop, {
      width: boardRect.width,
      height: boardRect.height
    });
  }

  onNodeDragEnd(nodeId: string, event: CdkDragEnd<CanvasNode>): void {
    const boardRect = this.canvasBoardRef.nativeElement.getBoundingClientRect();
    const nextPosition = event.source.getFreeDragPosition();

    this.canvasState.updateNodePosition(nodeId, nextPosition, {
      width: boardRect.width,
      height: boardRect.height
    });
  }

  onNodeClick(nodeId: string): void {
    console.log('Abrir panel de reglas para nodo:', nodeId);
  }

  edgeStartX(edge: CanvasEdge): number {
    return this.resolveNodeCenter(edge.sourceId).x;
  }

  edgeStartY(edge: CanvasEdge): number {
    return this.resolveNodeCenter(edge.sourceId).y;
  }

  edgeEndX(edge: CanvasEdge): number {
    return this.resolveNodeCenter(edge.targetId).x;
  }

  edgeEndY(edge: CanvasEdge): number {
    return this.resolveNodeCenter(edge.targetId).y;
  }

  private resolvePointerPosition(rawEvent: MouseEvent | TouchEvent): PointerPosition | null {
    if (rawEvent instanceof MouseEvent) {
      return { x: rawEvent.clientX, y: rawEvent.clientY };
    }

    if (rawEvent.changedTouches.length > 0) {
      const touch = rawEvent.changedTouches[0];
      return { x: touch.clientX, y: touch.clientY };
    }

    return null;
  }

  private resolveNodeCenter(nodeId: string): PointerPosition {
    const node = this.nodeMap().get(nodeId);
    if (!node) {
      return { x: 0, y: 0 };
    }

    return {
      x: node.x + node.width / 2,
      y: node.y + node.height / 2
    };
  }
}
