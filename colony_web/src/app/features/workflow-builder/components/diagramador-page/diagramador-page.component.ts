import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertaService } from '../../../../core/services/alerta.service';
import { PoliticaService } from '../../../../core/services/politica.service';
import { DiagramadorEstadoService } from '../../services/diagramador-estado.service';
import { WorkflowTemplateService } from '../../services/workflow-template.service';
import { HeaderToolbarComponent } from '../header-toolbar/header-toolbar.component';
import { LienzoCarrilesComponent } from '../lienzo-carriles/lienzo-carriles.component';
import { PanelPropiedadesComponent } from '../panel-propiedades/panel-propiedades.component';
import { CollabService } from '../../services/collab.service';
import { effect, computed, signal, HostListener } from '@angular/core';
import { Subscription } from 'rxjs';

export interface CursorInfo {
  x: number;
  y: number;
  name: string;
  color: string;
}

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
  private readonly workflowTemplateService = inject(WorkflowTemplateService);
  private readonly collabService = inject(CollabService);

  private collabSub?: Subscription;
  private isApplyingSync = false;
  private syncInterval: any;
  private lastSyncStr = '';

  flowName = 'Nuevo Flujo';
  isSaving = false;
  isDeleting = false;
  isLoadingPolicy = false;
  isSidebarOpen = false;
  saveMessage = '';
  isReadOnlyMode = false;

  readonly politicaActivaId = this.estado.politicaActivaId;
  readonly zoomNivel = this.estado.zoomNivel;
  
  readonly roomCode = this.collabService.roomCode;
  readonly isInitiator = this.collabService.isInitiator;

  // Cursos colaborativos
  readonly cursors = signal<Record<string, CursorInfo>>({});
  readonly cursorsArray = computed(() => {
    const obj = this.cursors();
    return Object.keys(obj).map(key => ({ id: key, ...obj[key] }));
  });
  readonly myName = 'Admin-' + this.collabService.clientId.substring(0, 4);
  private cursorTimeouts: Record<string, any> = {};

  @HostListener('mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {
    if (this.collabService.isConnected()) {
      // Throttle manual simple (opcional, pero ayuda a no saturar el socket)
      if (this.lastMouseMove && Date.now() - this.lastMouseMove < 50) return;
      this.lastMouseMove = Date.now();

      this.collabService.sendAction({
        type: 'CURSOR_MOVE',
        payload: { x: event.clientX, y: event.clientY, name: this.myName, color: '#ec4899' }
      });
    }
  }
  private lastMouseMove = 0;

  constructor() {
    this.collabSub = this.collabService.actionReceived$.subscribe(action => {
      if (action.type === 'SYNC_STATE') {
        this.isApplyingSync = true;
        this.flowName = action.payload.flowName;
        this.estado.hidratarDesdePolitica(action.payload.politica);
        this.lastSyncStr = JSON.stringify(action.payload.politica);
        // Timeout para evitar que la hidratación envíe la política de vuelta inmediatamente
        setTimeout(() => this.isApplyingSync = false, 500);
      } else if (action.type === 'CURSOR_MOVE') {
        const { x, y, name, color } = action.payload;
        this.cursors.update(c => ({
          ...c,
          [action.senderId]: { x, y, name, color }
        }));
        
        if (this.cursorTimeouts[action.senderId]) {
          clearTimeout(this.cursorTimeouts[action.senderId]);
        }
        this.cursorTimeouts[action.senderId] = setTimeout(() => {
          this.cursors.update(c => {
            const newC = { ...c };
            delete newC[action.senderId];
            return newC;
          });
        }, 5000); // El cursor desaparece tras 5 segundos de inactividad
      } else if (action.type === 'ROOM_CLOSED') {
        this.alertaService.mostrarExito('El creador de la sesión ha cerrado el canvas.');
        this.collabService.leaveRoom();
        this.router.navigate(['/app']);
      } else if (action.type === 'GUEST_JOINED') {
        if (this.collabService.isInitiator()) {
          this.sincronizarPosicionesYCarrilesDesdeDOM();
          const politica = this.estado.toPoliticaNegocio(this.flowName, 'BORRADOR');
          this.lastSyncStr = JSON.stringify(politica);
          this.collabService.sendAction({
            type: 'SYNC_STATE',
            payload: { flowName: this.flowName, politica }
          });
        }
      }
    });

    // Bucle de sincronización en tiempo real (1 vez por segundo)
    this.syncInterval = setInterval(() => {
      if (this.collabService.isConnected() && !this.isApplyingSync) {
        this.sincronizarPosicionesYCarrilesDesdeDOM();
        const politica = this.estado.toPoliticaNegocio(this.flowName, 'BORRADOR');
        const currentStateStr = JSON.stringify(politica);
        
        if (this.lastSyncStr !== currentStateStr) {
          this.lastSyncStr = currentStateStr;
          this.collabService.sendAction({
            type: 'SYNC_STATE',
            payload: { flowName: this.flowName, politica }
          });
        }
      }
    }, 1000);

    this.route.paramMap.subscribe((params) => {
      const policyId = params.get('id');
      const templateId = this.route.snapshot.queryParamMap.get('template');
      const currentPath = this.route.snapshot.routeConfig?.path ?? '';
      this.isReadOnlyMode = currentPath.includes('publicadas');

      const roomCodeParam = this.route.snapshot.queryParamMap.get('roomCode');
      if (roomCodeParam) {
        this.joinRoom(roomCodeParam);
        // Do not return here, let it initialize a blank canvas which will be overwritten by SYNC_STATE
      }

      if (!policyId && !templateId) {
        this.estado.limpiarDiagrama();
        this.flowName = 'Nuevo Flujo';
        return;
      }

      if (this.isReadOnlyMode) {
        if (!policyId) {
          this.estado.limpiarDiagrama();
          this.flowName = 'Nuevo Flujo';
          return;
        }

        this.isLoadingPolicy = true;
        this.saveMessage = '';

        this.politicaService.obtenerPoliticaPublicadaPorId(policyId).subscribe({
          next: (politica) => {
            this.estado.hidratarDesdePolitica(politica);
            this.flowName = politica.nombre || 'Flujo publicado';
            this.isLoadingPolicy = false;
          },
          error: () => {
            this.isLoadingPolicy = false;
            this.saveMessage = 'No se pudo cargar el flujo publicado solicitado.';
            this.alertaService.mostrarError(this.saveMessage);
          }
        });
        return;
      }

      if (!policyId && templateId) {
        const plantilla = this.workflowTemplateService.obtenerPlantillaParaEdicion(templateId);
        if (!plantilla) {
          this.estado.limpiarDiagrama();
          this.flowName = 'Nuevo Flujo';
          this.saveMessage = 'La plantilla seleccionada no existe.';
          this.alertaService.mostrarError(this.saveMessage);
          return;
        }

        this.estado.hidratarDesdePolitica(plantilla);
        this.flowName = plantilla.nombre || 'Nuevo Flujo';
        return;
      }

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

  ngOnDestroy(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    if (this.collabSub) {
      this.collabSub.unsubscribe();
    }
    this.collabService.leaveRoom();
  }

  createRoom(): void {
    this.collabService.createRoom();
    this.alertaService.mostrarExito('Código de invitación generado. Compártelo con otros administradores.');
    
    // Enviar estado inicial
    setTimeout(() => {
      this.isApplyingSync = false;
      const politica = this.estado.toPoliticaNegocio(this.flowName, 'BORRADOR');
      this.collabService.sendAction({
        type: 'SYNC_STATE',
        payload: { flowName: this.flowName, politica }
      });
    }, 1000);
  }

  joinRoom(code: string): void {
    this.collabService.joinRoom(code);
    this.alertaService.mostrarExito(`Uniéndose al canvas ${code}...`);
  }

  leaveRoom(): void {
    this.collabService.leaveRoom();
    if (!this.isInitiator()) {
      this.router.navigate(['/app']);
    }
  }

  onFlowNameChange(value: string): void {
    if (this.isReadOnlyMode) {
      return;
    }

    this.flowName = value;
    if (this.collabService.isConnected() && !this.isApplyingSync) {
      const politica = this.estado.toPoliticaNegocio(this.flowName, 'BORRADOR');
      this.collabService.sendAction({
        type: 'SYNC_STATE',
        payload: { flowName: this.flowName, politica }
      });
    }
  }

  agregarCarril(): void {
    if (this.isReadOnlyMode) {
      return;
    }

    this.estado.agregarCarril();
  }

  guardarBorrador(): void {
    if (this.isReadOnlyMode) {
      return;
    }

    this.sincronizarPosicionesYCarrilesDesdeDOM();
    this.persistPolicy('BORRADOR', true);
  }

  publicarFlujo(): void {
    if (this.isReadOnlyMode) {
      return;
    }

    this.estado.sincronizarCarrilIdSegunPosicionY(DiagramadorPageComponent.ALTO_CARRIL_PX);
    this.persistPolicy('PUBLICADA');
  }

  async eliminarDiagramaActual(): Promise<void> {
    if (this.isReadOnlyMode) {
      return;
    }

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
