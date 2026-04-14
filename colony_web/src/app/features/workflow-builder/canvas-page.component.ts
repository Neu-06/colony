import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { RouterModule } from '@angular/router';
import { PoliticaService } from '../../core/services/politica.service';
import { BoardComponent } from './board.component';
import { ConfigPanelComponent } from './config-panel.component';
import { CanvasStateService } from './services/canvas-state.service';
import { ToolbarComponent } from './toolbar.component';

@Component({
  selector: 'app-canvas-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, ToolbarComponent, BoardComponent, ConfigPanelComponent],
  templateUrl: './canvas-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CanvasPageComponent {
  private readonly canvasState = inject(CanvasStateService);
  private readonly politicaService = inject(PoliticaService);
  private readonly route = inject(ActivatedRoute);

  flowName = 'Nuevo Flujo';
  isSaving = false;
  isLoadingPolicy = false;
  saveMessage = '';
  isLeftSidebarCollapsed = false;
  isRightSidebarCollapsed = false;

  constructor() {
    this.route.paramMap.subscribe((params) => {
      const policyId = params.get('id');

      if (!policyId) {
        this.canvasState.resetCanvas();
        this.flowName = 'Nuevo Flujo';
        return;
      }

      this.isLoadingPolicy = true;
      this.saveMessage = '';
      this.politicaService.obtenerPoliticaPorId(policyId).subscribe({
        next: (politica) => {
          this.canvasState.hydrateFromPolitica(politica);
          this.flowName = politica.nombre || 'Flujo sin nombre';
          this.isLoadingPolicy = false;
        },
        error: () => {
          this.isLoadingPolicy = false;
          this.saveMessage = 'No se pudo cargar el borrador solicitado.';
        }
      });
    });
  }

  toggleLeftSidebar(): void {
    this.isLeftSidebarCollapsed = !this.isLeftSidebarCollapsed;
  }

  toggleRightSidebar(): void {
    this.isRightSidebarCollapsed = !this.isRightSidebarCollapsed;
  }

  saveDraft(): void {
    this.persistPolicy('BORRADOR');
  }

  publishGraph(): void {
    this.persistPolicy('PUBLICADA');
  }

  private persistPolicy(estado: string): void {
    const politica = this.canvasState.toPoliticaNegocio(this.flowName, estado);
    this.isSaving = true;
    this.saveMessage = '';

    this.politicaService.guardarPolitica(politica).subscribe({
      next: () => {
        this.isSaving = false;
        this.saveMessage = `Flujo guardado como ${estado}.`;
        window.alert(this.saveMessage);
      },
      error: () => {
        this.isSaving = false;
        this.saveMessage = 'No se pudo guardar el flujo. Verifica permisos y conexion con backend.';
        window.alert(this.saveMessage);
      }
    });
  }
}
