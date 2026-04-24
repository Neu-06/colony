import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import Swal from 'sweetalert2';
import { AlertaService } from '../../core/services/alerta.service';
import { AuthService } from '../../core/services/auth.service';
import { PrimerFormularioDto, TramiteCatalogoDto, TramiteService } from '../../core/services/tramite.service';

@Component({
  selector: 'app-directorio-tramites',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './directorio-tramites.component.html'
})
export class DirectorioTramitesComponent implements OnInit {
  private readonly tramiteService = inject(TramiteService);
  private readonly authService = inject(AuthService);
  private readonly alertaService = inject(AlertaService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);

  catalogo: TramiteCatalogoDto[] = [];
  primerFormulario: PrimerFormularioDto | null = null;
  politicaSeleccionada: TramiteCatalogoDto | null = null;
  isLoadingCatalogo = false;
  isLoadingFormulario = false;
  isSubmitting = false;
  errorMessage = '';

  readonly form = this.fb.group({});

  ngOnInit(): void {
    this.cargarCatalogo();
  }

  cargarCatalogo(): void {
    this.isLoadingCatalogo = true;
    this.errorMessage = '';

    this.tramiteService.listarPublicados().subscribe({
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
    this.politicaSeleccionada = politica;
    this.primerFormulario = null;
    this.isLoadingFormulario = true;
    this.form.reset({});

    for (const key of Object.keys(this.form.controls)) {
      this.form.removeControl(key);
    }

    this.tramiteService.obtenerPrimerFormulario(politica.id).subscribe({
      next: (primerFormulario) => {
        this.primerFormulario = primerFormulario;
        for (const campo of primerFormulario.esquemaFormulario ?? []) {
          const validators = campo.requerido ? [Validators.required] : [];
          this.form.addControl(campo.nombre, this.fb.control('', validators));
        }
        this.isLoadingFormulario = false;
      },
      error: () => {
        this.isLoadingFormulario = false;
        this.alertaService.mostrarError('No se pudo cargar el formulario inicial del tramite.');
      }
    });
  }

  crearYDerivar(): void {
    if (!this.politicaSeleccionada || !this.primerFormulario) {
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.alertaService.mostrarError('Completa los campos requeridos para iniciar el tramite.');
      return;
    }

    const usuarioId = this.authService.getCurrentUserId();
    if (!usuarioId) {
      this.alertaService.mostrarError('No se pudo resolver el usuario iniciador.');
      return;
    }

    this.isSubmitting = true;

    this.tramiteService
      .iniciarInstancia(this.politicaSeleccionada.id, usuarioId, this.form.value as Record<string, unknown>)
      .subscribe({
        next: async (response) => {
          this.isSubmitting = false;

          await Swal.fire({
            title: '¡Tramite Iniciado Exitosamente!',
            html: `Entregue este codigo de rastreo al cliente:<br><strong style="font-size:1.35rem">${response.codigoRastreo}</strong>`,
            icon: 'success',
            confirmButtonText: 'Entendido',
            buttonsStyling: false,
            customClass: {
              popup: 'rounded-2xl border border-emerald-200 bg-emerald-50 shadow-2xl',
              title: 'text-2xl font-bold text-emerald-800',
              htmlContainer: 'text-base text-emerald-900',
              confirmButton: 'rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600'
            }
          });

          void this.router.navigate(['/app/bandeja']);
        },
        error: () => {
          this.isSubmitting = false;
          this.alertaService.mostrarError('No se pudo crear y derivar el tramite.');
        }
      });
  }

  cerrarInicio(): void {
    this.politicaSeleccionada = null;
    this.primerFormulario = null;
    this.form.reset({});
    for (const key of Object.keys(this.form.controls)) {
      this.form.removeControl(key);
    }
  }
}
