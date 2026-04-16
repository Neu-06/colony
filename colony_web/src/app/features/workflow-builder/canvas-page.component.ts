import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Router } from '@angular/router';
import { RouterModule } from '@angular/router';
import { PoliticaNegocio } from '../../core/models/canvas.models';
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
  private readonly router = inject(Router);

  flowName = 'Nuevo Flujo';
  isSaving = false;
  isDeleting = false;
  isLoadingPolicy = false;
  saveMessage = '';
  isLeftSidebarCollapsed = false;
  isRightSidebarCollapsed = false;
  isMobileToolsOpen = false;
  isMobilePropertiesOpen = false;

  readonly activePolicyId = this.canvasState.activePolicyId;

  constructor() {
    this.route.paramMap.subscribe((params) => {
      const policyId = params.get('id');

      if (!policyId) {
        this.canvasState.resetCanvas();
        this.flowName = 'Nuevo Flujo';
        this.isMobileToolsOpen = false;
        this.isMobilePropertiesOpen = false;
        return;
      }

      this.isLoadingPolicy = true;
      this.saveMessage = '';
      this.politicaService.obtenerPoliticaPorId(policyId).subscribe({
        next: (politica) => {
          this.canvasState.hydrateFromPolitica(politica);
          this.flowName = politica.nombre || 'Flujo sin nombre';
          this.isLoadingPolicy = false;
          this.isMobileToolsOpen = false;
          this.isMobilePropertiesOpen = false;
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

  toggleMobileTools(): void {
    this.isMobileToolsOpen = !this.isMobileToolsOpen;
    if (this.isMobileToolsOpen) {
      this.isMobilePropertiesOpen = false;
    }
  }

  toggleMobileProperties(): void {
    this.isMobilePropertiesOpen = !this.isMobilePropertiesOpen;
    if (this.isMobilePropertiesOpen) {
      this.isMobileToolsOpen = false;
    }
  }

  closeMobilePanels(): void {
    this.isMobileToolsOpen = false;
    this.isMobilePropertiesOpen = false;
  }

  deleteCurrentDiagram(): void {
    const policyId = this.activePolicyId();
    if (!policyId) {
      this.saveMessage = 'Primero guarda el flujo para poder eliminarlo.';
      return;
    }

    const confirmed = window.confirm('Se eliminara permanentemente este diagrama. Esta accion no se puede deshacer.');
    if (!confirmed) {
      return;
    }

    this.isDeleting = true;
    this.saveMessage = '';

    this.politicaService.eliminarPolitica(policyId).subscribe({
      next: () => {
        this.isDeleting = false;
        this.closeMobilePanels();
        this.canvasState.resetCanvas();
        this.flowName = 'Nuevo Flujo';
        this.saveMessage = 'Diagrama eliminado permanentemente.';
        void this.router.navigate(['/app/canvas']);
      },
      error: () => {
        this.isDeleting = false;
        this.saveMessage = 'No se pudo eliminar el diagrama.';
      }
    });
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
      next: (saved: PoliticaNegocio) => {
        this.isSaving = false;
        this.canvasState.hydrateFromPolitica(saved);
        this.flowName = saved.nombre || this.flowName;
        this.closeMobilePanels();

        if (saved.id) {
          void this.router.navigate(['/app/canvas', saved.id], { replaceUrl: true });
        }

        this.saveMessage = `Flujo guardado como ${estado}.`;
      },
      error: () => {
        this.isSaving = false;
        this.saveMessage = 'No se pudo guardar el flujo. Verifica permisos y conexion con backend.';
      }
    });
  }
}
