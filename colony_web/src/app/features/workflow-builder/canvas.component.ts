import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

interface WorkflowCard {
  id: string;
  title: string;
  updatedAt: string;
  laneCount: number;
  nodeCount: number;
}

@Component({
  selector: 'app-canvas',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './canvas.component.html'
})
export class CanvasComponent {
  readonly workflows: WorkflowCard[] = [
    {
      id: 'wf-1',
      title: 'Aprobacion de Compras',
      updatedAt: 'Actualizado hace 2 horas',
      laneCount: 4,
      nodeCount: 16
    },
    {
      id: 'wf-2',
      title: 'Onboarding de Personal',
      updatedAt: 'Actualizado ayer',
      laneCount: 5,
      nodeCount: 23
    },
    {
      id: 'wf-3',
      title: 'Control de Incidencias',
      updatedAt: 'Actualizado hace 3 dias',
      laneCount: 3,
      nodeCount: 12
    }
  ];
}
