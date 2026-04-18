import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertaService } from '../../../../core/services/alerta.service';
import { PoliticaService } from '../../../../core/services/politica.service';
import { DiagramadorEstadoService } from '../../services/diagramador-estado.service';
import { HeaderToolbarComponent } from '../header-toolbar/header-toolbar.component';
import { LienzoCarrilesComponent } from '../lienzo-carriles/lienzo-carriles.component';
import { PanelPropiedadesComponent } from '../panel-propiedades/panel-propiedades.component';

@Component({
  selector: 'app-diagramador-page',
  standalone: true,
  imports: [CommonModule, HeaderToolbarComponent, LienzoCarrilesComponent, PanelPropiedadesComponent],
  templateUrl: './diagramador-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DiagramadorPageComponent {
  private static readonly ALTO_CARRIL_PX = 250;

  private readonly estado = inject(DiagramadorEstadoService);
  private readonly alertaService = inject(AlertaService);
  private readonly politicaService = inject(PoliticaService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  flowName = 'Nuevo Flujo';
  isSaving = false;
  isDeleting = false;
  isLoadingPolicy = false;
  isSidebarOpen = false;
  saveMessage = '';

  readonly politicaActivaId = this.estado.politicaActivaId;
  readonly zoomNivel = this.estado.zoomNivel;

  constructor() {
    this.route.paramMap.subscribe((params) => {
      const policyId = params.get('id');

      if (!policyId) {
        this.estado.limpiarDiagrama();
        this.flowName = 'Nuevo Flujo';
        return;
      }

      this.isLoadingPolicy = true;
      this.saveMessage = '';

      this.politicaService.obtenerPoliticaPorId(policyId).subscribe({
        next: (politica) => {
          this.estado.hidratarDesdePolitica(politica);
          this.flowName = politica.nombre || 'Flujo sin nombre';
          this.isLoadingPolicy = false;
        },
        error: () => {
          this.isLoadingPolicy = false;
          this.saveMessage = 'No se pudo cargar el borrador solicitado.';
          this.alertaService.mostrarError(this.saveMessage);
        }
      });
    });
  }

  onFlowNameChange(value: string): void {
    this.flowName = value;
  }

  agregarCarril(): void {
    this.estado.agregarCarril();
  }

  guardarBorrador(): void {
    this.sincronizarPosicionesYCarrilesDesdeDOM();
    this.persistPolicy('BORRADOR', true);
  }

  publicarFlujo(): void {
    this.estado.sincronizarCarrilIdSegunPosicionY(DiagramadorPageComponent.ALTO_CARRIL_PX);
    this.persistPolicy('PUBLICADA');
  }

  async eliminarDiagramaActual(): Promise<void> {
    const policyId = this.politicaActivaId();
    if (!policyId) {
      this.saveMessage = 'Primero guarda el flujo para poder eliminarlo.';
      this.alertaService.mostrarError(this.saveMessage);
      return;
    }

    const confirmed = await this.alertaService.confirmarAccion(
      'Eliminar diagrama',
      'Se eliminara permanentemente este diagrama. Esta accion no se puede deshacer.'
    );
    if (!confirmed) {
      return;
    }

    this.isDeleting = true;
    this.saveMessage = '';

    this.politicaService.eliminarPolitica(policyId).subscribe({
      next: () => {
        this.isDeleting = false;
        this.estado.limpiarDiagrama();
        this.flowName = 'Nuevo Flujo';
        this.saveMessage = 'Diagrama eliminado permanentemente.';
        this.alertaService.mostrarExito(this.saveMessage);
        void this.router.navigate(['/app/canvas']);
      },
      error: () => {
        this.isDeleting = false;
        this.saveMessage = 'No se pudo eliminar el diagrama.';
        this.alertaService.mostrarError(this.saveMessage);
      }
    });
  }

  zoomIn(): void {
    this.estado.zoomIn();
  }

  zoomOut(): void {
    this.estado.zoomOut();
  }

  toggleSidebar(): void {
    this.isSidebarOpen = !this.isSidebarOpen;
  }

  private sincronizarPosicionesYCarrilesDesdeDOM(): void {
    const nodos = this.estado.nodos();
    const carriles = this.estado.carriles();

    for (const nodo of nodos) {
      const elemento = document.getElementById(`node-${nodo.idNodo}`);
      if (!elemento) {
        continue;
      }

      const x = elemento.offsetLeft;
      const y = elemento.offsetTop;
      const indiceCarril = Math.floor(y / DiagramadorPageComponent.ALTO_CARRIL_PX);
      const carril = carriles[indiceCarril];

      this.estado.actualizarNodo(nodo.idNodo, {
        posicion: { x, y },
        carrilId: carril ? carril.id : nodo.carrilId
      });
    }
  }

  private persistPolicy(estado: string, incrementarVersion = false): void {
    const politica = this.estado.toPoliticaNegocio(this.flowName, estado);
    const payload = {
      ...politica,
      nombre: politica.nombre,
      carriles: politica.carriles ?? [],
      nodos: politica.nodos ?? [],
      aristas: politica.aristas ?? []
    };

    if (incrementarVersion) {
      payload.version = (payload.version || 0) + 1;
    }

    this.isSaving = true;
    this.saveMessage = '';

    this.politicaService.guardarPolitica(payload).subscribe({
      next: (saved) => {
        this.isSaving = false;
        this.estado.hidratarDesdePolitica(saved);
        this.flowName = saved.nombre || this.flowName;

        if (saved.id) {
          void this.router.navigate(['/app/canvas', saved.id], { replaceUrl: true });
        }

        this.saveMessage = `Flujo guardado como ${estado}.`;
        this.alertaService.mostrarExito('Flujo guardado correctamente');
      },
      error: () => {
        this.isSaving = false;
        this.saveMessage = 'No se pudo guardar el flujo. Verifica permisos y conexion con backend.';
        this.alertaService.mostrarError(this.saveMessage);
      }
    });
  }
}
