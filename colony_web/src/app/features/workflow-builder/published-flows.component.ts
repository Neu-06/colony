import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { PoliticaPublicadaResumen, PoliticaService } from '../../core/services/politica.service';

@Component({
  selector: 'app-published-flows',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './published-flows.component.html'
})
export class PublishedFlowsComponent implements OnInit {
  private readonly politicaService = inject(PoliticaService);

  publicadas: PoliticaPublicadaResumen[] = [];
  isLoading = false;
  errorMessage = '';

  ngOnInit(): void {
    this.cargarPublicadas();
  }

  cargarPublicadas(): void {
    this.isLoading = true;
    this.errorMessage = '';

    this.politicaService.obtenerPoliticasPublicadas().subscribe({
      next: (publicadas) => {
        this.publicadas = publicadas;
        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
        this.errorMessage = 'No se pudieron cargar los flujos publicados.';
      }
    });
  }
}
