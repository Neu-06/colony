import { Component, EventEmitter, Input, Output, inject, PLATFORM_ID, NgZone } from '@angular/core';
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

  private readonly aiService = inject(AiCopilotoService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly ngZone = inject(NgZone);

  messages: Message[] = [];
  comandoDetectado = '';
  isAiLoading = false;
  estaEscuchando = false;
  recognition: any;

  constructor() {
    this.initSpeechRecognition();
  }

  initSpeechRecognition() {
    if (isPlatformBrowser(this.platformId) && ('webkitSpeechRecognition' in window)) {
      this.recognition = new webkitSpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.lang = 'es-ES';

      this.recognition.onstart = () => {
        this.ngZone.run(() => this.estaEscuchando = true);
      };

      this.recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        const confidence = event.results[0][0].confidence;
        
        this.ngZone.run(() => {
          this.comandoDetectado = transcript;
          this.estaEscuchando = false;
          
          // Si la confianza es alta, enviamos automáticamente
          if (confidence > 0.8) {
            this.enviarComando();
          }
        });
      };

      this.recognition.onerror = () => {
        this.ngZone.run(() => this.estaEscuchando = false);
      };

      this.recognition.onend = () => {
        this.ngZone.run(() => this.estaEscuchando = false);
      };
    }
  }

  toggleDictado() {
    if (this.estaEscuchando) {
      this.recognition.stop();
    } else {
      this.comandoDetectado = '';
      this.recognition.start();
    }
  }

  enviarComando(): void {
    if (!this.comandoDetectado.trim() || this.isAiLoading) return;

    const userText = this.comandoDetectado.trim();
    this.messages.push({ role: 'user', text: userText });
    this.comandoDetectado = '';
    this.isAiLoading = true;

    this.aiService.enviarComandoChat(this.canvasJson, userText).subscribe({
      next: (nuevoJson) => {
        this.isAiLoading = false;
        if (nuevoJson) {
          this.messages.push({ role: 'assistant', text: 'Entendido. He procesado tu solicitud en el lienzo.' });
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
      },
      error: () => this.isAiLoading = false
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
        this.updateCanvas.emit(nuevoJson);
      },
      error: () => this.isAiLoading = false
    });
  }
}
