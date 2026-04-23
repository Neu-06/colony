import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { PoliticaNegocio } from '../../core/models/canvas.models';
import { AlertaService } from '../../core/services/alerta.service';
import { AuthService } from '../../core/services/auth.service';
import { PoliticaService } from '../../core/services/politica.service';
import { WorkflowTemplateService } from './services/workflow-template.service';
import { WorkflowTemplate } from './templates/workflow-templates.data';
import { Router } from '@angular/router';
import Swal from 'sweetalert2';


@Component({
  selector: 'app-canvas',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './canvas.component.html'
})
export class CanvasComponent implements OnInit {
  private readonly politicaService = inject(PoliticaService);
  private readonly alertaService = inject(AlertaService);
  private readonly authService = inject(AuthService);
  private readonly workflowTemplateService = inject(WorkflowTemplateService);
  private readonly router = inject(Router);

  borradores: PoliticaNegocio[] = [];
  plantillas: WorkflowTemplate[] = [];
  isLoading = false;
  deletingId: string | null = null;
  errorMessage = '';
  currentRole = this.authService.getCurrentRole();

  get canCreateFlow(): boolean {
    return this.currentRole === 'ADMIN';
  }

  ngOnInit(): void {
    this.currentRole = this.authService.getCurrentRole();
    this.plantillas = this.workflowTemplateService.listarPlantillas();

    if (this.canCreateFlow) {
      this.loadDrafts();
      return;
    }

    this.borradores = [];
    this.isLoading = false;
  }

  loadDrafts(): void {
    this.isLoading = true;
    this.errorMessage = '';

    this.politicaService.obtenerMisBorradores().subscribe({
      next: (borradores) => {
        this.borradores = borradores;
        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
        this.errorMessage = 'No se pudieron cargar tus borradores.';
        this.alertaService.mostrarError(this.errorMessage);
      }
    });
  }

  async deleteDraft(politica: PoliticaNegocio): Promise<void> {
    if (!politica.id) {
      return;
    }

    const confirmed = await this.alertaService.confirmarAccion(
      'Eliminar borrador',
      `Se eliminara permanentemente el flujo "${politica.nombre || 'Sin nombre'}".`
    );
    if (!confirmed) {
      return;
    }

    this.deletingId = politica.id;

    this.politicaService.eliminarPolitica(politica.id).subscribe({
      next: () => {
        this.deletingId = null;
        this.borradores = this.borradores.filter((item) => item.id !== politica.id);
        this.alertaService.mostrarExito('Borrador eliminado correctamente.');
      },
      error: () => {
        this.deletingId = null;
        this.errorMessage = 'No se pudo eliminar el borrador.';
        this.alertaService.mostrarError(this.errorMessage);
      }
    });
  }

  async onJoinRoom(): Promise<void> {
    const { value: code } = await Swal.fire({
      title: 'Unirse a Canvas',
      input: 'text',
      inputLabel: 'Introduce el código de invitación',
      inputPlaceholder: 'Ej: AB123C',
      showCancelButton: true,
      confirmButtonText: 'Unirse',
      cancelButtonText: 'Cancelar',
      inputValidator: (value) => {
        if (!value) {
          return '¡Necesitas escribir un código!';
        }
        return null;
      }
    });

    if (code) {
      void this.router.navigate(['/app/canvas'], { queryParams: { roomCode: code.trim().toUpperCase() } });
    }
  }
}
