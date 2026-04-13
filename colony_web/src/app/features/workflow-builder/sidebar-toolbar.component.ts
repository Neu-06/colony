import { CdkDrag, CdkDropList, DragDropModule } from '@angular/cdk/drag-drop';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CanvasStateService, CanvasTool } from '../../core/services/canvas-state.service';

@Component({
  selector: 'app-sidebar-toolbar',
  standalone: true,
  imports: [CommonModule, DragDropModule, CdkDropList, CdkDrag],
  templateUrl: './sidebar-toolbar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SidebarToolbarComponent {
  private readonly canvasState = inject(CanvasStateService);

  readonly tools = this.canvasState.tools;
  readonly toolbarDropListId = 'canvas-toolbar-list';

  trackTool(index: number, tool: CanvasTool): string {
    return `${tool.type}-${index}`;
  }
}
