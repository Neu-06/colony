import { PoliticaNegocio } from '../../../core/models/canvas.models';

export interface WorkflowTemplate {
  id: string;
  nombre: string;
  descripcion: string;
  politica: PoliticaNegocio;
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'solicitud-vacaciones',
    nombre: 'Solicitud de Vacaciones',
    descripcion: 'Flujo basico con revision de jefe y decision final.',
    politica: {
      nombre: 'Plantilla - Solicitud de Vacaciones',
      version: 1,
      estado: 'BORRADOR',
      carriles: [
        { id: 'carril-1', nombre: 'Solicitante', orden: 1 },
        { id: 'carril-2', nombre: 'Jefatura', orden: 2 }
      ],
      nodos: [
        {
          idNodo: 'inicio-1',
          tipo: 'inicio',
          nombre: 'Inicio',
          posicion: { x: 160, y: 80 },
          carrilId: 'carril-1',
          esquemaFormulario: []
        },
        {
          idNodo: 'tarea-2',
          tipo: 'tarea',
          nombre: 'Registrar Solicitud',
          posicion: { x: 360, y: 80 },
          carrilId: 'carril-1',
          esquemaFormulario: [
            { nombre: 'fechaInicio', tipo: 'date', requerido: true },
            { nombre: 'fechaFin', tipo: 'date', requerido: true }
          ]
        },
        {
          idNodo: 'compuerta-3',
          tipo: 'compuerta',
          condicionLogica: 'Aprobado?',
          posicion: { x: 560, y: 330 },
          carrilId: 'carril-2'
        },
        {
          idNodo: 'tarea-4',
          tipo: 'tarea',
          nombre: 'Notificar Aprobacion',
          posicion: { x: 760, y: 260 },
          carrilId: 'carril-2',
          esquemaFormulario: []
        },
        {
          idNodo: 'fin-5',
          tipo: 'fin',
          nombre: 'Fin',
          posicion: { x: 960, y: 260 },
          carrilId: 'carril-2',
          esquemaFormulario: []
        },
        {
          idNodo: 'tarea-6',
          tipo: 'tarea',
          nombre: 'Notificar Rechazo',
          posicion: { x: 760, y: 380 },
          carrilId: 'carril-2',
          esquemaFormulario: []
        }
      ],
      aristas: [
        { origenNodoId: 'inicio-1', destinoNodoId: 'tarea-2' },
        { origenNodoId: 'tarea-2', destinoNodoId: 'compuerta-3' },
        { origenNodoId: 'compuerta-3', destinoNodoId: 'tarea-4', etiqueta: 'SI' },
        { origenNodoId: 'tarea-4', destinoNodoId: 'fin-5' },
        { origenNodoId: 'compuerta-3', destinoNodoId: 'tarea-6', etiqueta: 'NO' }
      ]
    }
  },
  {
    id: 'compras-simples',
    nombre: 'Compras Simples',
    descripcion: 'Solicitud, validacion presupuestaria y cierre de compra.',
    politica: {
      nombre: 'Plantilla - Compras Simples',
      version: 1,
      estado: 'BORRADOR',
      carriles: [
        { id: 'carril-1', nombre: 'Area Solicitante', orden: 1 },
        { id: 'carril-2', nombre: 'Finanzas', orden: 2 }
      ],
      nodos: [
        {
          idNodo: 'inicio-1',
          tipo: 'inicio',
          nombre: 'Inicio',
          posicion: { x: 150, y: 80 },
          carrilId: 'carril-1',
          esquemaFormulario: []
        },
        {
          idNodo: 'tarea-2',
          tipo: 'tarea',
          nombre: 'Registrar Requerimiento',
          posicion: { x: 340, y: 80 },
          carrilId: 'carril-1',
          esquemaFormulario: [
            { nombre: 'item', tipo: 'text', requerido: true },
            { nombre: 'monto', tipo: 'number', requerido: true }
          ]
        },
        {
          idNodo: 'tarea-3',
          tipo: 'tarea',
          nombre: 'Validar Presupuesto',
          posicion: { x: 560, y: 300 },
          carrilId: 'carril-2',
          esquemaFormulario: []
        },
        {
          idNodo: 'fin-4',
          tipo: 'fin',
          nombre: 'Fin',
          posicion: { x: 780, y: 300 },
          carrilId: 'carril-2',
          esquemaFormulario: []
        }
      ],
      aristas: [
        { origenNodoId: 'inicio-1', destinoNodoId: 'tarea-2' },
        { origenNodoId: 'tarea-2', destinoNodoId: 'tarea-3' },
        { origenNodoId: 'tarea-3', destinoNodoId: 'fin-4' }
      ]
    }
  }
];
