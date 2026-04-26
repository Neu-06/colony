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
import { IAService } from '../../services/ia.service';
import { JsplumbWrapperService } from '../../services/jsplumb-wrapper.service';
import { effect, computed, signal, HostListener, ViewChild, AfterViewInit } from '@angular/core';
import { Subscription, Subject } from 'rxjs';
import { debounceTime, filter } from 'rxjs/operators';
import Swal from 'sweetalert2';

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
export class DiagramadorPageComponent implements AfterViewInit {
  private static readonly ALTO_CARRIL_PX = 250;

  @ViewChild(LienzoCarrilesComponent) lienzo!: LienzoCarrilesComponent;

  public readonly estado = inject(DiagramadorEstadoService);
  private readonly alertaService = inject(AlertaService);
  private readonly politicaService = inject(PoliticaService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly workflowTemplateService = inject(WorkflowTemplateService);
  private readonly collabService = inject(CollabService);
  private readonly iaService = inject(IAService);
  private readonly jsplumb = inject(JsplumbWrapperService);

  private collabSub?: Subscription;
  private isApplyingSync = false;
  private syncInterval: any;
  private lastSyncStr = '';

  private autoSaveSubject$ = new Subject<void>();

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

    /*
    // Requerimiento 2: Autosave con RxJS
    this.autoSaveSubject$.pipe(
      debounceTime(3000)
    ).subscribe(() => {
      if (!this.isReadOnlyMode) {
        this.guardarBorradorSilencioso();
      }
    });
    */

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

  ngAfterViewInit(): void {
    if (this.lienzo) {
      this.lienzo.diagramChanged.subscribe(() => {
        this.autoSaveSubject$.next();
      });
    }
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
    this.autoSaveSubject$.next();
  }

  guardarBorradorSilencioso(): void {
    this.sincronizarPosicionesYCarrilesDesdeDOM();
    const aristasLienzo = this.jsplumb.obtenerAristasDesdeLienzo();
    const politica = this.estado.toPoliticaNegocio(this.flowName, 'BORRADOR');
    
    const payload = {
      ...politica,
      aristas: aristasLienzo.length > 0 ? aristasLienzo : politica.aristas
    };

    this.politicaService.guardarPolitica(payload).subscribe({
      next: (saved) => {
        this.estado.hidratarDesdePolitica(saved);
        console.log('Autoguardado silencioso completado');
      }
    });
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

  zoomFit(): void {
    this.estado.zoomFit();
  }

  async analizarWorkflowConIA(): Promise<void> {
    // Sincronizar posiciones del DOM antes de enviar
    this.sincronizarPosicionesYCarrilesDesdeDOM();
    const canvasData = this.estado.toPoliticaNegocio(this.flowName, 'BORRADOR');

    // Mostrar spinner de carga
    Swal.fire({
      title: 'Analizando con IA...',
      html: 'La IA está revisando la estructura del workflow.<br><small>Esto puede tardar unos segundos.</small>',
      allowOutsideClick: false,
      allowEscapeKey: false,
      didOpen: () => Swal.showLoading(),
      heightAuto: false
    });

    this.iaService.analizarCanvas(canvasData).subscribe({
      next: (resultado) => {
        Swal.close();

        const alertasEstructura: string[] = [];
        if (resultado.faltaInicio) {
          alertasEstructura.push('<li>🔴 <strong>Falta un nodo de INICIO</strong> en el flujo.</li>');
        }
        if (resultado.faltaFin) {
          alertasEstructura.push('<li>🔴 <strong>Falta un nodo de FIN</strong> en el flujo.</li>');
        }
        if (resultado.nodosSinConexion?.length > 0) {
          alertasEstructura.push(`<li>⚠️ <strong>Nodos sin conexión:</strong> ${resultado.nodosSinConexion.join(', ')}</li>`);
        }

        const sugerenciasHtml = (resultado.sugerencias ?? []).length > 0
          ? resultado.sugerencias.map(s => `<li>💡 ${s}</li>`).join('')
          : '<li>💡 El flujo parece estar bien estructurado.</li>';

        const problemasHtml = alertasEstructura.length > 0
          ? `<div style="text-align:left;margin-bottom:12px">
              <p style="font-weight:bold;margin-bottom:6px;color:#dc2626">Problemas detectados:</p>
              <ul style="padding-left:16px;line-height:1.8">${alertasEstructura.join('')}</ul>
             </div>`
          : `<p style="color:#059669;font-weight:bold;margin-bottom:12px">✅ Sin problemas estructurales detectados.</p>`;

        Swal.fire({
          title: '✨ Análisis de IA Completado',
          html: `
            ${problemasHtml}
            <div style="text-align:left">
              <p style="font-weight:bold;margin-bottom:6px;color:#7c3aed">Sugerencias de mejora:</p>
              <ul style="padding-left:16px;line-height:1.9;text-align:left">${sugerenciasHtml}</ul>
            </div>
          `,
          icon: alertasEstructura.length > 0 ? 'warning' : 'success',
          confirmButtonText: 'Entendido',
          confirmButtonColor: '#7c3aed',
          width: '600px',
          heightAuto: false
        });
      },
      error: (err) => {
        Swal.close();
        const is503 = err?.status === 503;
        Swal.fire({
          title: is503 ? '🤖 Asistente de IA fuera de línea' : 'Error al analizar',
          text: is503
            ? 'El motor de IA no está disponible. Asegúrate de que el servicio colony_ai esté ejecutándose en el puerto 8000.'
            : 'Ocurrió un error inesperado al contactar el servicio de IA. Intenta nuevamente.',
          icon: 'error',
          confirmButtonText: 'Cerrar',
          heightAuto: false
        });
      }
    });
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

        // Requerimiento 3: ELIMINAR navegación/recarga que rompe el flujo
        // if (saved.id) {
        //   void this.router.navigate(['/app/canvas', saved.id], { replaceUrl: true });
        // }

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
