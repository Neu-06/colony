import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AlertaService } from '../../core/services/alerta.service';
import { AuthService } from '../../core/services/auth.service';
import { BandejaItemDto, BandejaService } from '../../core/services/bandeja.service';
import { CopilotoFuncionarioComponent } from './ai-copiloto-funcionario/copiloto-funcionario.component';
import { TareaItemAI } from './ai-copiloto-funcionario/funcionario-ai.service';
import { Client } from '@stomp/stompjs';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-bandeja-tareas',
  standalone: true,
  imports: [CommonModule, CopilotoFuncionarioComponent],
  templateUrl: './bandeja-tareas.component.html'
})
export class BandejaTareasComponent implements OnInit, OnDestroy {
  private readonly bandejaService = inject(BandejaService);
  private readonly authService = inject(AuthService);
  private readonly alertaService = inject(AlertaService);
  private readonly router = inject(Router);

  tareas: BandejaItemDto[] = [];
  isLoading = false;
  openingId: string | null = null;
  errorMessage = '';
  
  private stompClient: Client | null = null;

  get tareasParaAI(): TareaItemAI[] {
    return this.tareas.map(t => ({
      instanciaId: t.instanciaId,
      codigoTramite: t.codigoTramite,
      nombrePolitica: t.nombrePolitica,
      nombreNodoActual: t.nombreNodoActual,
      fecha: t.fecha,
      semaforo: t.semaforo
    }));
  }

  onAiAbrirTarea(event: { instanciaId: string }): void {
    const tarea = this.tareas.find(t => t.instanciaId === event.instanciaId);
    if (tarea) {
      this.abrirTramite(tarea);
    }
  }

  ngOnInit(): void {
    this.cargarBandeja();
    this.conectarWebSocket();
  }

  ngOnDestroy(): void {
    this.stompClient?.deactivate();
  }

  conectarWebSocket(): void {
    const wsUrl = environment.aiBaseUrl || 'ws://localhost:8080/ws';
    this.stompClient = new Client({
      brokerURL: wsUrl,
      reconnectDelay: 5000,
      onConnect: () => {
        this.stompClient?.subscribe('/topic/ai-updates', (message) => {
          try {
            const aiData = JSON.parse(message.body);
            // Mutación optimista: actualizar las tarjetas en vivo
            const tareaIdx = this.tareas.findIndex(t => t.instanciaId === aiData.instanciaId);
            if (tareaIdx !== -1) {
              this.tareas[tareaIdx] = {
                ...this.tareas[tareaIdx],
                scoreRiesgo: aiData.scoreRiesgo,
                prioridadAnalitica: aiData.prioridadAnalitica,
                semaforo: aiData.semaforo || this.tareas[tareaIdx].semaforo
              };
            }
          } catch (error) {
            console.error('Error parseando AI update:', error);
          }
        });
      }
    });
    this.stompClient.activate();
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
