import { Component, EventEmitter, Input, Output, inject, PLATFORM_ID, NgZone, ViewChild, ElementRef } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AiCopilotoService } from '../../../../core/services/ai-copiloto.service';
import Swal from 'sweetalert2';

interface Message {
  role: 'user' | 'assistant';
  text: string;
}

// Declaración para TypeScript
declare var webkitSpeechRecognition: any;

@Component({
  selector: 'app-ai-assistant',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ai-assistant.component.html'
})
export class AiAssistantComponent {
  @Input() canvasJson: any;
  @Output() updateCanvas = new EventEmitter<any>();

  @ViewChild('chatScroll') private chatScrollContainer!: ElementRef;

  private readonly aiService = inject(AiCopilotoService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly ngZone = inject(NgZone);

  messages: Message[] = [];
  comandoDetectado = '';
  isAiLoading = false;
  estaEscuchando = false;
  recognition: any;
  private silenceTimer: any;

  constructor() {
    this.initSpeechRecognition();
  }

  initSpeechRecognition() {
    if (isPlatformBrowser(this.platformId) && ('webkitSpeechRecognition' in window)) {
      this.recognition = new webkitSpeechRecognition();
      
      // CONFIGURACIÓN PARA EVITAR CORTES
      this.recognition.continuous = true; // Escucha constante hasta que paremos manual o detectemos silencio largo
      this.recognition.interimResults = true; // Feedback inmediato
      this.recognition.lang = 'es-ES';

      this.recognition.onstart = () => {
        this.ngZone.run(() => {
          this.estaEscuchando = true;
          console.log("Micrófono activo");
        });
      };

      this.recognition.onresult = (event: any) => {
        this.ngZone.run(() => {
          let transcript = '';
          for (let i = 0; i < event.results.length; ++i) {
            transcript += event.results[i][0].transcript;
          }
          this.comandoDetectado = transcript;

          // DETECCIÓN DE SILENCIO PARA ENVIAR (1.5 segundos de silencio)
          clearTimeout(this.silenceTimer);
          this.silenceTimer = setTimeout(() => {
            if (this.estaEscuchando && this.comandoDetectado.trim()) {
              this.enviarComando();
              this.recognition.stop();
            }
          }, 1500);
        });
      };

      this.recognition.onerror = (event: any) => {
        console.error("Error de reconocimiento:", event.error);
        this.ngZone.run(() => this.estaEscuchando = false);
      };

      this.recognition.onend = () => {
        this.ngZone.run(() => {
          this.estaEscuchando = false;
          console.log("Micrófono desactivado");
        });
      };
    }
  }

  toggleDictado() {
    if (!this.recognition) return;

    if (this.estaEscuchando) {
      this.recognition.stop();
      this.estaEscuchando = false;
    } else {
      this.comandoDetectado = '';
      try {
        this.recognition.start();
        // El estado se pondrá true en onstart para ser precisos, 
        // pero podemos ponerlo aquí para feedback instantáneo si onstart tarda
        this.estaEscuchando = true; 
      } catch (e) {
        this.recognition.stop();
        this.estaEscuchando = false;
      }
    }
  }

  private hacerScrollAbajo(): void {
    setTimeout(() => {
      try {
        if (this.chatScrollContainer) {
          this.chatScrollContainer.nativeElement.scrollTop = this.chatScrollContainer.nativeElement.scrollHeight;
        }
      } catch (err) {}
    }, 100);
  }

  enviarComando(): void {
    if (!this.comandoDetectado.trim() || this.isAiLoading) return;

    const userText = this.comandoDetectado.trim();
    this.messages.push({ role: 'user', text: userText });
    this.hacerScrollAbajo();
    
    this.comandoDetectado = '';
    this.isAiLoading = true;

    this.aiService.enviarComandoChat(this.canvasJson, userText).subscribe({
      next: (nuevoJson) => {
        this.isAiLoading = false;
        if (nuevoJson) {
          this.messages.push({ role: 'assistant', text: 'Entendido. He procesado tu solicitud en el lienzo.' });
          this.hacerScrollAbajo();
          this.updateCanvas.emit(nuevoJson);
          
          Swal.fire({
            toast: true,
            position: 'bottom-end',
            icon: 'success',
            title: 'IA: Cambio aplicado',
            showConfirmButton: false,
            timer: 2000
          });
        }
      },
      error: () => {
        this.isAiLoading = false;
        this.messages.push({ role: 'assistant', text: 'Error al conectar con el cerebro de IA.' });
        this.hacerScrollAbajo();
      }
    });
  }

  sugerirMejoras(): void {
    if (this.isAiLoading) return;
    this.messages = []; // Limpiar chat para mostrar solo lo nuevo
    this.isAiLoading = true;
    this.aiService.recomendar(this.canvasJson).subscribe({
      next: (res) => {
        this.isAiLoading = false;
        const msg = res.sugerencias?.length > 0 
          ? `IA Sugiere: ${res.sugerencias.join('. ')}` 
          : 'Tu diagrama se ve impecable.';
        this.messages.push({ role: 'assistant', text: msg });
        this.hacerScrollAbajo();
      },
      error: () => {
        this.isAiLoading = false;
        this.hacerScrollAbajo();
      }
    });
  }

  autoCorregir(): void {
    if (this.isAiLoading) return;
    this.messages = []; // Limpiar chat para mostrar solo lo nuevo
    this.isAiLoading = true;
    this.aiService.autocorregir(this.canvasJson).subscribe({
      next: (nuevoJson) => {
        this.isAiLoading = false;
        this.messages.push({ role: 'assistant', text: 'He corregido la estructura del flujo automáticamente.' });
        this.hacerScrollAbajo();
        this.updateCanvas.emit(nuevoJson);
      },
      error: () => {
        this.isAiLoading = false;
        this.hacerScrollAbajo();
      }
    });
  }
}
