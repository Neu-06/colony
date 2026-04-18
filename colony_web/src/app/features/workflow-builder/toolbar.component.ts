import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';

interface ToolItem {
  key: 'inicio' | 'tarea' | 'compuerta' | 'fin';
  dragType: 'INICIO' | 'TAREA' | 'COMPUERTA' | 'FIN';
  title: string;
}

@Component({
  selector: 'app-toolbar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './toolbar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ToolbarComponent {
  readonly dragMimeType = 'application/x-diagramador-node';

  readonly items: ToolItem[] = [
    { key: 'inicio', dragType: 'INICIO', title: 'Inicio' },
    { key: 'tarea', dragType: 'TAREA', title: 'Tarea' },
    { key: 'compuerta', dragType: 'COMPUERTA', title: 'Compuerta' },
    { key: 'fin', dragType: 'FIN', title: 'Fin' }
  ];

  onDragStart(event: DragEvent, dragType: ToolItem['dragType']): void {
    if (!event.dataTransfer) {
      return;
    }

    event.dataTransfer.setData(this.dragMimeType, dragType);
    event.dataTransfer.setData('application/x-canvas-node', dragType);
    event.dataTransfer.setData('text/plain', dragType);
    event.dataTransfer.effectAllowed = 'copy';
  }
}
