import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AiCopilotoService } from '../../../../core/services/ai-copiloto.service';
import Swal from 'sweetalert2';

interface Message {
  role: 'user' | 'assistant';
  text: string;
}

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

  messages: Message[] = [];
  comandoUsuario = '';
  isAiLoading = false;

  enviarComando(): void {
    if (!this.comandoUsuario.trim() || this.isAiLoading) return;

    const userText = this.comandoUsuario.trim();
    this.messages.push({ role: 'user', text: userText });
    this.comandoUsuario = '';
    this.isAiLoading = true;

    this.aiService.enviarComandoChat(this.canvasJson, userText).subscribe({
      next: (nuevoJson) => {
        this.isAiLoading = false;
        if (nuevoJson) {
          this.messages.push({ role: 'assistant', text: 'He actualizado el diagrama según tus instrucciones.' });
          this.updateCanvas.emit(nuevoJson);
          
          Swal.fire({
            toast: true,
            position: 'bottom-end',
            icon: 'success',
            title: 'Lienzo actualizado',
            showConfirmButton: false,
            timer: 2000
          });
        }
      },
      error: () => {
        this.isAiLoading = false;
        this.messages.push({ role: 'assistant', text: 'Lo siento, hubo un error al procesar tu solicitud.' });
      }
    });
  }

  sugerirMejoras(): void {
    if (this.isAiLoading) return;
    this.isAiLoading = true;
    this.aiService.recomendar(this.canvasJson).subscribe({
      next: (res) => {
        this.isAiLoading = false;
        const msg = res.sugerencias?.length > 0 
          ? `Sugerencias: ${res.sugerencias.join(', ')}` 
          : 'El flujo se ve bien estructurado.';
        this.messages.push({ role: 'assistant', text: msg });
      },
      error: () => this.isAiLoading = false
    });
  }

  autoCorregir(): void {
    if (this.isAiLoading) return;
    this.isAiLoading = true;
    this.aiService.autocorregir(this.canvasJson).subscribe({
      next: (nuevoJson) => {
        this.isAiLoading = false;
        this.messages.push({ role: 'assistant', text: 'He aplicado correcciones estructurales básicas.' });
        this.updateCanvas.emit(nuevoJson);
      },
      error: () => this.isAiLoading = false
    });
  }
}
