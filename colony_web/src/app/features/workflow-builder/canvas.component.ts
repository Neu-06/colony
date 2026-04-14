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
}
