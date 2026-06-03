import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import Swal from 'sweetalert2';
import { AlertaService } from '../../core/services/alerta.service';
import { AuthService } from '../../core/services/auth.service';
import { PrimerFormularioDto, TramiteService } from '../../core/services/tramite.service';
import { CopilotoFuncionarioComponent, AiFormFillEvent } from './ai-copiloto-funcionario/copiloto-funcionario.component';
import { CampoFormularioAI } from './ai-copiloto-funcionario/funcionario-ai.service';
import { RepositorioDocumentalComponent } from './repositorio-documental/repositorio-documental.component';
import { DocumentoService } from '../../core/services/documento.service';

@Component({
  selector: 'app-iniciar-tramite',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, CopilotoFuncionarioComponent, RepositorioDocumentalComponent],
  templateUrl: './iniciar-tramite.component.html'
})
export class IniciarTramiteComponent implements OnInit {
  private readonly tramiteService = inject(TramiteService);
  private readonly authService = inject(AuthService);
  private readonly alertaService = inject(AlertaService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly documentoService = inject(DocumentoService);

  politicaId: string = '';
  primerFormulario: PrimerFormularioDto | null = null;
  isLoadingFormulario = false;
  isSubmitting = false;

  readonly form = this.fb.group({});
  archivosSeleccionados: File[] = [];

  get documentosRequeridos(): string[] {
    return (this.primerFormulario?.esquemaFormulario ?? [])
      .filter(c => c.tipo === 'archivo')
      .map(c => c.nombre);
  }

  get esquemaParaAI(): CampoFormularioAI[] {
    return (this.primerFormulario?.esquemaFormulario ?? []).map(c => ({
      nombre: c.nombre,
      tipo: c.tipo,
      requerido: c.requerido,
      opciones: c.opciones
    }));
  }

  get valoresParaAI(): Record<string, unknown> {
    return this.form.value as Record<string, unknown>;
  }

  onAiCamposRellenados(event: AiFormFillEvent): void {
    for (const [campo, valor] of Object.entries(event.camposRellenos)) {
      if (this.form.contains(campo)) {
        this.form.get(campo)!.setValue(valor);
      }
    }
  }

  onAiSolicitarEnvio(): void {
    this.crearYDerivar();
  }

  onArchivoSeleccionado(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.archivosSeleccionados.push(...Array.from(input.files));
      input.value = '';
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer?.files) {
      this.archivosSeleccionados.push(...Array.from(event.dataTransfer.files));
    }
  }

  eliminarArchivo(index: number): void {
    this.archivosSeleccionados.splice(index, 1);
  }

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      const id = params.get('politicaId');
      if (id) {
        this.politicaId = id;
        this.cargarFormularioInicial();
      } else {
        this.alertaService.mostrarError('ID de política no válido');
        void this.router.navigate(['/app/directorio-tramites']);
      }
    });
  }

  cargarFormularioInicial(): void {
    this.isLoadingFormulario = true;
    for (const key of Object.keys(this.form.controls)) {
      this.form.removeControl(key);
    }

    this.tramiteService.obtenerPrimerFormulario(this.politicaId).subscribe({
      next: (primerFormulario) => {
        this.primerFormulario = primerFormulario;
        for (const campo of primerFormulario.esquemaFormulario ?? []) {
          if (campo.tipo === 'archivo' || campo.tipo === 'file') continue;
          const validators = campo.requerido ? [Validators.required] : [];
          const esBooleano = campo.tipo === 'boolean' || campo.tipo === 'bool';
          this.form.addControl(campo.nombre, this.fb.control(esBooleano ? false : '', validators));
        }
        this.isLoadingFormulario = false;
      },
      error: () => {
        this.isLoadingFormulario = false;
        this.alertaService.mostrarError('No se pudo cargar el formulario inicial del trámite.');
        void this.router.navigate(['/app/directorio-tramites']);
      }
    });
  }

  crearYDerivar(): void {
    if (!this.politicaId || !this.primerFormulario) {
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.alertaService.mostrarError('Completa los campos requeridos para iniciar el trámite.');
      return;
    }

    if (this.archivosSeleccionados.length < this.documentosRequeridos.length) {
      this.alertaService.mostrarError(`Faltan documentos requeridos. Por favor, asegúrate de adjuntar al menos ${this.documentosRequeridos.length} documento(s).`);
      return;
    }

    const usuarioId = this.authService.getCurrentUserId();
    if (!usuarioId) {
      this.alertaService.mostrarError('No se pudo resolver el usuario iniciador.');
      return;
    }

    this.isSubmitting = true;

    this.tramiteService
      .iniciarInstancia(this.politicaId, usuarioId, this.form.value as Record<string, unknown>)
      .subscribe({
        next: async (response) => {
          if (this.archivosSeleccionados.length > 0) {
            for (const file of this.archivosSeleccionados) {
              await new Promise<void>((resolve) => {
                this.documentoService.subirDocumento(response.instanciaId, file).subscribe({
                  next: () => resolve(),
                  error: () => resolve()
                });
              });
            }
          }

          this.isSubmitting = false;

          await Swal.fire({
            title: '¡Trámite Iniciado Exitosamente!',
            html: `Entregue este código de rastreo al cliente:<br><strong style="font-size:1.35rem">${response.codigoRastreo}</strong>`,
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
          this.alertaService.mostrarError('No se pudo crear y derivar el trámite.');
        }
      });
  }
  
  volver(): void {
    void this.router.navigate(['/app/directorio-tramites']);
  }
}
