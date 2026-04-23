import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { RouterModule } from '@angular/router';

interface HerramientaNodo {
  key: 'inicio' | 'tarea' | 'compuerta' | 'fin';
  dragType: 'INICIO' | 'TAREA' | 'COMPUERTA' | 'FIN';
  title: string;
}

@Component({
  selector: 'app-header-toolbar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './header-toolbar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HeaderToolbarComponent {
  @Input({ required: true }) flowName = '';
  @Input() isSaving = false;
  @Input() isDeleting = false;
  @Input() hasActivePolicy = false;
  @Input() zoomNivel = 1;
  @Input() isReadOnly = false;

  @Output() readonly flowNameChange = new EventEmitter<string>();
  @Output() readonly addCarril = new EventEmitter<void>();
  @Output() readonly saveDraft = new EventEmitter<void>();
  @Output() readonly publish = new EventEmitter<void>();
  @Output() readonly deleteDiagram = new EventEmitter<void>();
  @Output() readonly zoomIn = new EventEmitter<void>();
  @Output() readonly zoomOut = new EventEmitter<void>();

  readonly dragMimeType = 'application/x-diagramador-node';

  readonly herramientas: HerramientaNodo[] = [
    { key: 'inicio', dragType: 'INICIO', title: 'Inicio' },
    { key: 'tarea', dragType: 'TAREA', title: 'Tarea' },
    { key: 'compuerta', dragType: 'COMPUERTA', title: 'Compuerta' },
    { key: 'fin', dragType: 'FIN', title: 'Fin' }
  ];

  onNameInput(value: string): void {
    this.flowNameChange.emit(value);
  }

  onDragStart(event: DragEvent, dragType: HerramientaNodo['dragType']): void {
    if (!event.dataTransfer) {
      return;
    }

    event.dataTransfer.setData(this.dragMimeType, dragType);
    event.dataTransfer.setData('application/x-canvas-node', dragType);
    event.dataTransfer.setData('text/plain', dragType);
    event.dataTransfer.effectAllowed = 'copy';
  }
}
