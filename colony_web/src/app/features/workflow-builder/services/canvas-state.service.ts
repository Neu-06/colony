import { Injectable } from '@angular/core';
import { DiagramadorEstadoService } from './diagramador-estado.service';

export type ToolNodeType = 'inicio' | 'tarea' | 'compuerta' | 'fin';

@Injectable({
  providedIn: 'root'
})
export class CanvasStateService extends DiagramadorEstadoService {}
