import {
  Component, Input, Output, EventEmitter,
  NgZone, inject, PLATFORM_ID, OnDestroy
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  FuncionarioAiService,
  TareaItemAI,
  CampoFormularioAI
} from './funcionario-ai.service';

declare var webkitSpeechRecognition: any;

export interface AiFormFillEvent {
  camposRellenos: Record<string, unknown>;
}

export interface AiNavigateEvent {
  instanciaId: string;
}

@Component({
  selector: 'app-copiloto-funcionario',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './copiloto-funcionario.component.html'
})
export class CopilotoFuncionarioComponent implements OnDestroy {
  /** Contexto de la bandeja: se pasa desde bandeja-tareas */
  @Input() tareas: TareaItemAI[] = [];

  /** Contexto del formulario activo: se pasa desde atencion-tramite */
  @Input() esquemaFormulario: CampoFormularioAI[] = [];
  @Input() valoresActuales: Record<string, unknown> = {};

  /** Emite cuando la IA rellena campos del formulario */
  @Output() camposRellenados = new EventEmitter<AiFormFillEvent>();

  /** Emite cuando la IA quiere abrir una tarea */
  @Output() navegarATarea = new EventEmitter<AiNavigateEvent>();

  /** Emite cuando la IA dice que el formulario está listo para enviar */
  @Output() solicitarEnvio = new EventEmitter<void>();

  private readonly aiService = inject(FuncionarioAiService);
  private readonly ngZone = inject(NgZone);
  private readonly platformId = inject(PLATFORM_ID);

  // Estado del panel
  panelAbierto = false;
  isLoading = false;
  estaEscuchando = false;
  texto = '';
  mensajeRespuesta = '';
  esError = false;
  recognition: any;
  private silenceTimer: any;

  constructor() {
    this.initVoz();
  }

  togglePanel(): void {
    this.panelAbierto = !this.panelAbierto;
    if (!this.panelAbierto) {
      this.pararVoz();
    }
  }

  initVoz(): void {
    if (isPlatformBrowser(this.platformId) && 'webkitSpeechRecognition' in window) {
      this.recognition = new webkitSpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'es-ES';

      this.recognition.onstart = () => {
        this.ngZone.run(() => { this.estaEscuchando = true; this.texto = ''; });
      };

      this.recognition.onresult = (event: any) => {
        this.ngZone.run(() => {
          let transcript = '';
          for (let i = 0; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript;
          }
          this.texto = transcript;

          clearTimeout(this.silenceTimer);
          this.silenceTimer = setTimeout(() => {
            if (this.estaEscuchando && this.texto.trim()) {
              this.procesarComando();
              this.pararVoz();
            }
          }, 1500);
        });
      };

      this.recognition.onend = () => {
        this.ngZone.run(() => { this.estaEscuchando = false; });
      };

      this.recognition.onerror = () => {
        this.ngZone.run(() => { this.estaEscuchando = false; });
      };
    }
  }

  toggleVoz(): void {
    if (!this.recognition) return;
    if (this.estaEscuchando) {
      this.pararVoz();
    } else {
      this.texto = '';
      this.recognition.start();
      this.estaEscuchando = true;
    }
  }

  pararVoz(): void {
    if (this.recognition && this.estaEscuchando) {
      this.recognition.stop();
      this.estaEscuchando = false;
    }
    clearTimeout(this.silenceTimer);
  }

  procesarComando(): void {
    const comandoTexto = this.texto.trim();
    if (!comandoTexto || this.isLoading) return;

    this.isLoading = true;
    this.mensajeRespuesta = '';
    this.esError = false;

    // Determinar modo: si hay formulario activo → modo formulario; si no → modo bandeja
    const modoFormulario = this.esquemaFormulario.length > 0;

    // Detectar si es una solicitud de envío
    const esSolicitudEnvio = /\b(env[íi]a|enviar|completar? y enviar|mandar|siguiente|avanzar)\b/i.test(comandoTexto);

    if (esSolicitudEnvio && modoFormulario) {
      this.aiService.validarEnvio(this.esquemaFormulario, this.valoresActuales).subscribe({
        next: (res) => {
          this.isLoading = false;
          this.mensajeRespuesta = res.mensaje;
          if (res.puedeEnviar) {
            this.solicitarEnvio.emit();
          } else {
            this.esError = true;
          }
        },
        error: () => this.manejarError()
      });
      return;
    }

    if (modoFormulario) {
      this.aiService.rellenarFormulario(comandoTexto, this.esquemaFormulario, this.valoresActuales).subscribe({
        next: (res) => {
          this.isLoading = false;
          this.mensajeRespuesta = res.mensaje;
          if (Object.keys(res.camposRellenos).length > 0) {
            this.camposRellenados.emit({ camposRellenos: res.camposRellenos });
          }
        },
        error: () => this.manejarError()
      });
    } else {
      // Modo bandeja
      this.aiService.comandoBandeja(comandoTexto, this.tareas).subscribe({
        next: (res) => {
          this.isLoading = false;
          this.mensajeRespuesta = res.mensaje;
          if (res.accion === 'abrir_tarea' && res.instanciaId) {
            this.navegarATarea.emit({ instanciaId: res.instanciaId });
          }
        },
        error: () => this.manejarError()
      });
    }
  }

  private manejarError(): void {
    this.isLoading = false;
    this.mensajeRespuesta = 'No pude conectar con el asistente. Intenta de nuevo.';
    this.esError = true;
  }

  ngOnDestroy(): void {
    this.pararVoz();
  }
}
