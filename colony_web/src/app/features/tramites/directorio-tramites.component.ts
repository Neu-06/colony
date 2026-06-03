import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import Swal from 'sweetalert2';
import { AlertaService } from '../../core/services/alerta.service';
import { AuthService } from '../../core/services/auth.service';
import { TramiteCatalogoDto, TramiteService } from '../../core/services/tramite.service';

@Component({
  selector: 'app-directorio-tramites',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './directorio-tramites.component.html'
})
export class DirectorioTramitesComponent implements OnInit {
  private readonly tramiteService = inject(TramiteService);
  private readonly authService = inject(AuthService);
  private readonly alertaService = inject(AlertaService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);

  catalogo: TramiteCatalogoDto[] = [];
  isLoadingCatalogo = false;
  errorMessage = '';

  ngOnInit(): void {
    this.cargarCatalogo();
  }

  cargarCatalogo(): void {
    const dptoId = this.authService.getCurrentDepartment();
    if (!dptoId) {
      this.errorMessage = 'No tienes departamento asignado';
      this.alertaService.mostrarError(this.errorMessage);
      return;
    }

    this.isLoadingCatalogo = true;
    this.errorMessage = '';

    this.tramiteService.listarPublicados(dptoId).subscribe({
      next: (catalogo) => {
        this.catalogo = catalogo;
        this.isLoadingCatalogo = false;
      },
      error: () => {
        this.isLoadingCatalogo = false;
        this.errorMessage = 'No se pudo cargar el directorio de tramites.';
        this.alertaService.mostrarError(this.errorMessage);
      }
    });
  }

  iniciarTramite(politica: TramiteCatalogoDto): void {
    void this.router.navigate(['/app/tramites/iniciar', politica.id]);
  }
}
