import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData, ChartType } from 'chart.js';
import { KpiGeneralDTO, MetricaRendimientoDTO, MetricasService } from '../../core/services/metricas.service';

import { DecimalPipe } from '@angular/common';

@Component({
  selector: 'app-dashboard-metricas',
  standalone: true,
  imports: [CommonModule, BaseChartDirective, DecimalPipe],
  templateUrl: './dashboard-metricas.component.html'
})
export class DashboardMetricasComponent implements OnInit {
  @ViewChild(BaseChartDirective) chart?: BaseChartDirective;
  private readonly metricasService = inject(MetricasService);

  kpis: KpiGeneralDTO | null = null;
  rendimiento: MetricaRendimientoDTO[] = [];
  cuellos: MetricaRendimientoDTO[] = [];
  isLoading = true;

  // Chart 1: Distribución (Doughnut)
  public distChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right',
        labels: { usePointStyle: true, font: { size: 12 } }
      }
    }
  };
  public distChartData: ChartData<'doughnut'> = {
    labels: [],
    datasets: [{
      data: [],
      backgroundColor: [
        'rgba(59, 130, 246, 0.8)',
        'rgba(16, 185, 129, 0.8)',
        'rgba(245, 158, 11, 0.8)',
        'rgba(239, 68, 68, 0.8)',
        'rgba(139, 92, 246, 0.8)'
      ],
      hoverOffset: 4
    }]
  };

  // Chart 2: Cuellos de Botella (Barras Horizontales)
  public bottleneckChartOptions: ChartConfiguration['options'] = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    scales: { x: { min: 0, title: { display: true, text: 'Minutos Promedio' } } },
    plugins: { legend: { display: false } }
  };
  public bottleneckChartData: ChartData<'bar'> = {
    labels: [],
    datasets: [{ 
      data: [], 
      label: 'Tiempo Promedio (Minutos)',
      backgroundColor: 'rgba(239, 68, 68, 0.6)',
      borderColor: 'rgb(239, 68, 68)',
      borderWidth: 1,
      borderRadius: 8
    }]
  };

  ngOnInit(): void {
    this.cargarDatos();
  }

  cargarDatos(): void {
    this.isLoading = true;
    
    this.metricasService.getGeneral().subscribe(data => {
      this.kpis = data;
    });

    this.metricasService.getRendimientoUsuarios().subscribe({
      next: (data) => {
        this.rendimiento = data;
        this.distChartData = {
          labels: data.map(r => r.identificador || 'Anónimo'),
          datasets: [{ 
            ...this.distChartData.datasets[0],
            data: data.map(r => r.cantidadTramites)
          }]
        };
        this.chart?.update();
      }
    });

    this.metricasService.getCuellosBotella().subscribe({
      next: (data) => {
        this.cuellos = data;
        this.bottleneckChartData = {
          labels: data.map(r => r.identificador || 'Tarea'),
          datasets: [{ 
            ...this.bottleneckChartData.datasets[0],
            data: data.map(r => Number((r.tiempoPromedioSegundos / 60).toFixed(2)))
          }]
        };
        this.isLoading = false;
      },
      error: () => this.isLoading = false
    });
  }

  formatearTiempo(segundos: number): string {
    if (segundos < 60) return `${segundos.toFixed(0)}s`;
    const minutos = segundos / 60;
    if (minutos < 60) return `${minutos.toFixed(1)}m`;
    const horas = minutos / 60;
    return `${horas.toFixed(1)}h`;
  }

  esCuelloBotella(segundos: number): boolean {
    return segundos > 3600; // Más de 1 hora
  }
}
