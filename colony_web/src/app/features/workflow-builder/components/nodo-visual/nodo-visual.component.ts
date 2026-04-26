import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { NodoCanvas } from '../../models/canvas.models';

@Component({
  selector: 'app-nodo-visual',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './nodo-visual.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NodoVisualComponent {
  @Input({ required: true }) datos!: NodoCanvas;

  tipoNodo(): 'inicio' | 'fin' | 'compuerta' | 'fork' | 'join' | 'tarea' {
    if (this.datos.tipo === 'compuerta' || this.datos.tipo === 'gateway' || this.datos.tipo === 'salida_condicional') {
      return 'compuerta';
    }

    if (this.datos.tipo === 'inicio' || this.datos.tipo === 'start') {
      return 'inicio';
    }

    if (this.datos.tipo === 'fin' || this.datos.tipo === 'end') {
      return 'fin';
    }

    if (this.datos.tipo === 'fork') {
      return 'fork';
    }

    if (this.datos.tipo === 'join') {
      return 'join';
    }

    return 'tarea';
  }

  etiquetaNodo(): string {
    const tipo = this.tipoNodo();

    if (tipo === 'compuerta') {
      return (this.datos as { condicionLogica?: string }).condicionLogica?.trim() || 'Compuerta';
    }

    if (tipo === 'tarea') {
      return (this.datos as { nombre?: string }).nombre?.trim() || 'Tarea';
    }

    return (this.datos as { nombre?: string }).nombre?.trim() || (tipo === 'inicio' ? 'Inicio' : 'Fin');
  }
}
