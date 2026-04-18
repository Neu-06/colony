import { ChangeDetectionStrategy, Component } from '@angular/core';
import { DiagramadorPageComponent } from './components/diagramador-page/diagramador-page.component';

@Component({
  selector: 'app-canvas-page',
  standalone: true,
  imports: [DiagramadorPageComponent],
  templateUrl: './canvas-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CanvasPageComponent {}
