import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData, ChartType } from 'chart.js';
import { KpiGeneralDTO, MetricaRendimientoDTO, MetricasService } from '../../core/services/metricas.service';

import { DecimalPipe } from '@angular/common';

import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-dashboard-metricas',
  standalone: true,
  imports: [CommonModule, BaseChartDirective, DecimalPipe, FormsModule],
  templateUrl: './dashboard-metricas.component.html'
})
export class DashboardMetricasComponent implements OnInit {
  @ViewChild(BaseChartDirective) chart?: BaseChartDirective;
  private readonly metricasService = inject(MetricasService);

  kpis: KpiGeneralDTO | null = null;
  rendimiento: MetricaRendimientoDTO[] = [];
  cuellos: MetricaRendimientoDTO[] = [];
  anomalias: any[] = [];
  systemHealthScore: number = 100;
  isLoading = true;

  chatInput: string = '';
  chatMessages: { text: string, isUser: boolean }[] = [];

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
  // Chart 3: Distribución de Riesgos ML (Doughnut)
  public riskChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'right', labels: { usePointStyle: true, font: { size: 12 } } } }
  };
  public riskChartData: ChartData<'doughnut'> = {
    labels: ['Riesgo Crítico (>90%)', 'Riesgo Alto (>75%)', 'Riesgo Medio'],
    datasets: [{
      data: [0, 0, 0],
      backgroundColor: ['rgba(225, 29, 72, 0.8)', 'rgba(245, 158, 11, 0.8)', 'rgba(59, 130, 246, 0.8)'],
      hoverOffset: 4
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
      error: () => {
        this.isLoading = false;
      }
    });

    // Cargar anomalías ML
    this.metricasService.getAnomalias().subscribe({
      next: (data: any[]) => {
        this.anomalias = data;
        
        // Calcular Distribución de Riesgos
        let criticos = 0;
        let altos = 0;
        let medios = 0;
        data.forEach(a => {
          if (a.scoreRiesgo >= 0.9) criticos++;
          else if (a.scoreRiesgo >= 0.75) altos++;
          else medios++;
        });
        
        this.riskChartData = {
          ...this.riskChartData,
          datasets: [{ ...this.riskChartData.datasets[0], data: [criticos, altos, medios] }]
        };
        this.chart?.update();
        
        this.calcularHealthScore();
        this.iniciarChatProactivo();
      },
      error: (err) => console.error('Error cargando anomalías ML', err)
    });
  }

  calcularHealthScore() {
    if (!this.kpis || this.kpis.totalInstancias === 0) return;
    const errorRatio = (this.anomalias.length / this.kpis.totalInstancias) * 100;
    const processRatio = (this.kpis.enProceso / this.kpis.totalInstancias) * 50; 
    let score = 100 - errorRatio - (processRatio > 40 ? 10 : 0);
    this.systemHealthScore = Math.max(0, Math.min(100, Math.round(score)));
  }

  iniciarChatProactivo() {
    let msg = `Hola. He analizado la data actual y el sistema presenta una salud del ${this.systemHealthScore}%. `;
    if (this.anomalias.length > 0 && this.cuellos.length > 0) {
      const criticos = this.anomalias.filter(a => a.scoreRiesgo >= 0.9).length;
      msg += `Te sugiero priorizar la tarea "${this.cuellos[0].identificador}" de "${this.cuellos[0].nombrePolitica}" porque es el área con mayor demora actual. Además, he detectado ${criticos} instancias en estado crítico. ¿Te gustaría saber más detalles?`;
    } else {
      msg += `Los flujos están corriendo sin bloqueos severos. ¿En qué más te puedo ayudar hoy?`;
    }
    this.chatMessages.push({ text: msg, isUser: false });
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

  enviarMensajeChat() {
    if (!this.chatInput.trim()) return;
    
    // Add user message
    this.chatMessages.push({ text: this.chatInput, isUser: true });
    
    // Simulate AI response based on the input
    const input = this.chatInput.toLowerCase();
    this.chatInput = '';
    
    setTimeout(() => {
      let response = "Interesante. Los datos muestran una correlación directa entre el tiempo en tareas manuales y el riesgo de abandono.";
      
      if (input.includes("anomalia") || input.includes("anomalía")) {
        response = `He detectado ${this.anomalias.length} trámites con comportamiento anómalo. Las anomalías más comunes involucran tiempos atípicamente largos o retrocesos extraños.`;
      } else if (input.includes("riesgo")) {
        response = "El modelo predictivo clasifica los riesgos en base al tiempo promedio, la prioridad detectada en los documentos (usando NLP) y el estado de los nodos paralelos.";
      } else if (input.includes("retraso") || input.includes("cuello") || input.includes("lento") || input.includes("demora")) {
        if (this.cuellos.length > 0) {
           const top = this.cuellos[0];
           response = `El mayor cuello de botella detectado está en el área de trabajo "${top.identificador}" del flujo "${top.nombrePolitica}". `;
        } else {
           response = "Actualmente no se registran cuellos de botella severos en áreas de trabajo.";
        }
      } else if (input.includes("documentos") || input.includes("nlp")) {
        response = "El NLP determinó prioridades altas basado en palabras clave como 'urgente' o 'emergencia' en los reclamos.";
      }
      
      this.chatMessages.push({ text: response, isUser: false });
      
      // Scroll to bottom
      setTimeout(() => {
        const chatDiv = document.getElementById('chat-messages');
        if (chatDiv) chatDiv.scrollTop = chatDiv.scrollHeight;
      }, 100);
    }, 800);
  }
}
