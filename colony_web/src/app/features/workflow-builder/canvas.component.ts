import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { PoliticaNegocio } from '../../core/models/canvas.models';
import { PoliticaService } from '../../core/services/politica.service';


@Component({
  selector: 'app-canvas',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './canvas.component.html'
})
export class CanvasComponent implements OnInit {
  private readonly politicaService = inject(PoliticaService);

  borradores: PoliticaNegocio[] = [];
  isLoading = false;
  deletingId: string | null = null;
  errorMessage = '';

  ngOnInit(): void {
    this.loadDrafts();
  }

  loadDrafts(): void {
    this.isLoading = true;
    this.errorMessage = '';

    this.politicaService.obtenerMisBorradores().subscribe({
      next: (borradores) => {
        this.borradores = borradores;
        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
        this.errorMessage = 'No se pudieron cargar tus borradores.';
      }
    });
  }

  deleteDraft(politica: PoliticaNegocio): void {
    if (!politica.id) {
      return;
    }

    const confirmed = window.confirm(`Se eliminara permanentemente el flujo "${politica.nombre || 'Sin nombre'}". Deseas continuar?`);
    if (!confirmed) {
      return;
    }

    this.deletingId = politica.id;

    this.politicaService.eliminarPolitica(politica.id).subscribe({
      next: () => {
        this.deletingId = null;
        this.borradores = this.borradores.filter((item) => item.id !== politica.id);
      },
      error: () => {
        this.deletingId = null;
        this.errorMessage = 'No se pudo eliminar el borrador.';
      }
    });
  }
}
