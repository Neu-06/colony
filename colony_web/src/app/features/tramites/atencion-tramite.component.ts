import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertaService } from '../../core/services/alerta.service';
import { AtencionTramiteDto, BandejaService } from '../../core/services/bandeja.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-atencion-tramite',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './atencion-tramite.component.html'
})
export class AtencionTramiteComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly bandejaService = inject(BandejaService);
  private readonly alertaService = inject(AlertaService);
  private readonly authService = inject(AuthService);

  tramite: AtencionTramiteDto | null = null;
  isLoading = false;
  isSubmitting = false;
  errorMessage = '';

  readonly form = this.fb.group({});

  get historialEntries(): Array<{ key: string; value: unknown }> {
    if (!this.tramite?.datosDinamicos) {
      return [];
    }

    return Object.entries(this.tramite.datosDinamicos).map(([key, value]) => ({ key, value }));
  }

  ngOnInit(): void {
    const instanciaId = this.route.snapshot.paramMap.get('instanciaId');
    const tareaId = this.route.snapshot.queryParamMap.get('tareaId');
    
    if (!instanciaId) {
      this.errorMessage = 'No se recibio el ID del tramite.';
      return;
    }

    this.cargarTramite(instanciaId, tareaId || undefined);
  }

  cargarTramite(instanciaId: string, tareaId?: string): void {
    this.isLoading = true;
    this.errorMessage = '';

    this.bandejaService.obtenerAtencion(instanciaId, tareaId).subscribe({
      next: (tramite) => {
        this.tramite = tramite;
        this.form.reset({});

        for (const campo of tramite.esquemaFormulario ?? []) {
          const validators = campo.requerido ? [Validators.required] : [];
          const esBooleano = campo.tipo === 'boolean' || campo.tipo === 'bool';
          this.form.addControl(campo.nombre, this.fb.control(esBooleano ? false : '', validators));
        }

        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
        this.errorMessage = 'No se pudo cargar el tramite para atencion.';
        this.alertaService.mostrarError(this.errorMessage);
      }
    });
  }

  completarYEnviar(): void {
    if (!this.tramite) {
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.alertaService.mostrarError('Completa los campos requeridos antes de enviar.');
      return;
    }

    this.isSubmitting = true;
    const usuarioId = this.authService.getCurrentUserId() || '';

    this.bandejaService.avanzarTramite(
      this.tramite.instanciaId, 
      usuarioId, 
      this.form.value as Record<string, unknown>,
      this.tramite.nodoActualId
    ).subscribe({
      next: () => {
        this.isSubmitting = false;
        this.alertaService.mostrarExito('Tramite enviado al siguiente estado.');
        void this.router.navigate(['/app/bandeja']);
      },
      error: () => {
        this.isSubmitting = false;
        this.alertaService.mostrarError('No se pudo completar el tramite.');
      }
    });
  }

  cancelar(): void {
    void this.router.navigate(['/app/bandeja']);
  }

  get isAutomatica(): boolean {
    if (!this.tramite) return false;
    // Si el backend accidentalmente nos manda un nodo de control, lo detectamos
    const tipo = (this.tramite.nodoActualId || '').toLowerCase();
    return tipo.includes('fork') || tipo.includes('join') || tipo.includes('decision') || tipo.includes('gateway');
  }

  formatValor(value: unknown): string {
    if (value === null || value === undefined) {
      return '-';
    }

    if (typeof value === 'object') {
      return JSON.stringify(value);
    }

    return String(value);
  }
}
