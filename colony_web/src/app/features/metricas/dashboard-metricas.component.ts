import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData, ChartType } from 'chart.js';
import { KpiGeneralDTO, MetricaRendimientoDTO, MetricasService } from '../../core/services/metricas.service';

@Component({
  selector: 'app-dashboard-metricas',
  standalone: true,
  imports: [CommonModule, BaseChartDirective],
  templateUrl: './dashboard-metricas.component.html'
})
export class DashboardMetricasComponent implements OnInit {
  private readonly metricasService = inject(MetricasService);

  kpis: KpiGeneralDTO | null = null;
  rendimiento: MetricaRendimientoDTO[] = [];
  isLoading = true;

  // Chart Configuration
  public barChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    scales: {
      x: {},
      y: {
        min: 0,
        title: {
          display: true,
          text: 'Minutos Promedio'
        }
      }
    },
    plugins: {
      legend: {
        display: true,
      }
    }
  };
  public barChartType: ChartType = 'bar';
  public barChartData: ChartData<'bar'> = {
    labels: [],
    datasets: [
      { 
        data: [], 
        label: 'Tiempo Promedio de Resolución (Minutos)',
        backgroundColor: 'rgba(59, 130, 246, 0.6)',
        borderColor: 'rgb(59, 130, 246)',
        borderWidth: 1
      }
    ]
  };

  ngOnInit(): void {
    this.cargarDatos();
  }

  cargarDatos(): void {
    this.isLoading = true;
    this.metricasService.getGeneral().subscribe({
      next: (data) => {
        this.kpis = data;
      }
    });

    this.metricasService.getRendimientoUsuarios().subscribe({
      next: (data) => {
        this.rendimiento = data;
        this.actualizarGrafico();
        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
      }
    });
  }

  actualizarGrafico(): void {
    this.barChartData.labels = this.rendimiento.map(r => r.identificador || 'Anonimo');
    this.barChartData.datasets[0].data = this.rendimiento.map(r => Number((r.tiempoPromedioSegundos / 60).toFixed(2)));
  }

  formatearTiempo(segundos: number): string {
    if (segundos < 60) return `${segundos.toFixed(0)}s`;
    const minutos = segundos / 60;
    if (minutos < 60) return `${minutos.toFixed(1)}m`;
    const horas = minutos / 60;
    return `${horas.toFixed(1)}h`;
  }

  esCuelloBotella(segundos: number): boolean {
    // Umbral de 24 horas = 86400 segundos
    return segundos > 86400;
  }
}
