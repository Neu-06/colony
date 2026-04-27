import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AlertaService } from '../../core/services/alerta.service';
import { AuthService } from '../../core/services/auth.service';
import { BandejaItemDto, BandejaService } from '../../core/services/bandeja.service';

@Component({
  selector: 'app-bandeja-tareas',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './bandeja-tareas.component.html'
})
export class BandejaTareasComponent implements OnInit {
  private readonly bandejaService = inject(BandejaService);
  private readonly authService = inject(AuthService);
  private readonly alertaService = inject(AlertaService);
  private readonly router = inject(Router);

  tareas: BandejaItemDto[] = [];
  isLoading = false;
  openingId: string | null = null;
  errorMessage = '';

  ngOnInit(): void {
    this.cargarBandeja();
  }

  cargarBandeja(): void {
    const departamentoId = this.authService.getCurrentDepartment();
    if (!departamentoId) {
      this.errorMessage = 'No se pudo resolver el departamento del usuario.';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    this.bandejaService.listarPorDepartamento(departamentoId).subscribe({
      next: (tareas) => {
        this.tareas = tareas;
        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
        this.errorMessage = 'No se pudo cargar la bandeja de tareas.';
        this.alertaService.mostrarError(this.errorMessage);
      }
    });
  }

  abrirTramite(item: BandejaItemDto): void {
    const usuarioId = this.authService.getCurrentUserId();
    if (!usuarioId) {
      this.alertaService.mostrarError('No se pudo resolver el usuario actual.');
      return;
    }

    this.openingId = item.instanciaId;

    this.bandejaService.tomarTramite(item.instanciaId, usuarioId).subscribe({
      next: () => {
        this.openingId = null;
        void this.router.navigate(['/app/tramites/atencion', item.instanciaId], { queryParams: { tareaId: item.nodoActualId } });
      },
      error: () => {
        this.openingId = null;
        this.alertaService.mostrarError('No se pudo abrir el tramite seleccionado.');
      }
    });
  }
}
