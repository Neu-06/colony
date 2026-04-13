import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CanvasStateService } from '../../core/services/canvas-state.service';
import { CanvasBoardComponent } from './canvas-board.component';
import { SidebarToolbarComponent } from './sidebar-toolbar.component';

@Component({
  selector: 'app-canvas-page',
  standalone: true,
  imports: [CommonModule, RouterModule, SidebarToolbarComponent, CanvasBoardComponent],
  templateUrl: './canvas-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CanvasPageComponent {
  private readonly canvasState = inject(CanvasStateService);

  publishGraph(): void {
    this.canvasState.logGraphSnapshot();
  }

  clearBoard(): void {
    this.canvasState.clearCanvas();
  }
}
