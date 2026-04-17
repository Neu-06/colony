import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CanvasStateService } from './services/canvas-state.service';

interface ToolItem {
  key: 'start' | 'task' | 'gateway' | 'end';
  dragType: 'INICIO' | 'TAREA' | 'COMPUERTA' | 'FIN';
  label: string;
  hint: string;
}

@Component({
  selector: 'app-toolbar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './toolbar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ToolbarComponent {
  private readonly canvasState = inject(CanvasStateService);

  readonly dragMimeType = 'application/x-canvas-node';
  readonly zoomLevel = this.canvasState.zoomLevel;

  readonly items: ToolItem[] = [
    { key: 'start', dragType: 'INICIO', label: 'Inicio', hint: 'Nodo inicial del flujo' },
    { key: 'task', dragType: 'TAREA', label: 'Tarea', hint: 'Actividad del proceso' },
    { key: 'gateway', dragType: 'COMPUERTA', label: 'Compuerta', hint: 'Condicion o desvio' },
    { key: 'end', dragType: 'FIN', label: 'Fin', hint: 'Cierre del flujo' }
  ];

  onDragStart(event: DragEvent, dragType: ToolItem['dragType']): void {
    if (!event.dataTransfer) {
      return;
    }

    event.dataTransfer.setData(this.dragMimeType, dragType);
    event.dataTransfer.setData('text/plain', dragType);
    event.dataTransfer.effectAllowed = 'copy';
  }

  zoomOut(): void {
    this.canvasState.decreaseZoom();
  }

  zoomIn(): void {
    this.canvasState.increaseZoom();
  }
}
