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
  cuellos: MetricaRendimientoDTO[] = [];
  isLoading = true;

  // Chart 1: Productividad (Barras Verticales)
  public prodChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    scales: { y: { min: 0, title: { display: true, text: 'Tareas Completadas' } } },
    plugins: { legend: { display: true } }
  };
  public prodChartData: ChartData<'bar'> = {
    labels: [],
    datasets: [{ 
      data: [], 
      label: 'Tareas por Funcionario',
      backgroundColor: 'rgba(34, 197, 94, 0.6)',
      borderColor: 'rgb(34, 197, 94)',
      borderWidth: 1
    }]
  };

  // Chart 2: Cuellos de Botella (Barras Horizontales)
  public bottleneckChartOptions: ChartConfiguration['options'] = {
    indexAxis: 'y',
    responsive: true,
    scales: { x: { min: 0, title: { display: true, text: 'Minutos Promedio' } } },
    plugins: { legend: { display: true } }
  };
  public bottleneckChartData: ChartData<'bar'> = {
    labels: [],
    datasets: [{ 
      data: [], 
      label: 'Tiempo Promedio (Minutos)',
      backgroundColor: 'rgba(239, 68, 68, 0.6)',
      borderColor: 'rgb(239, 68, 68)',
      borderWidth: 1
    }]
  };

  ngOnInit(): void {
    this.cargarDatos();
  }

  cargarDatos(): void {
    this.isLoading = true;
    
    // Carga paralela de KPIs
    this.metricasService.getGeneral().subscribe(data => this.kpis = data);

    // Carga de Productividad
    this.metricasService.getRendimientoUsuarios().subscribe({
      next: (data) => {
        this.rendimiento = data;
        this.prodChartData.labels = data.map(r => r.identificador || 'Anonimo');
        this.prodChartData.datasets[0].data = data.map(r => r.cantidadTramites);
      }
    });

    // Carga de Cuellos de Botella
    this.metricasService.getCuellosBotella().subscribe({
      next: (data) => {
        this.cuellos = data;
        this.bottleneckChartData.labels = data.map(r => r.identificador || 'Tarea');
        this.bottleneckChartData.datasets[0].data = data.map(r => Number((r.tiempoPromedioSegundos / 60).toFixed(2)));
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
    // Umbral de 24 horas = 86400 segundos
    return segundos > 86400;
  }
}
