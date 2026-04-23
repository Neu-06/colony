import { Injectable } from '@angular/core';
import { PoliticaNegocio } from '../../../core/models/canvas.models';
import { WORKFLOW_TEMPLATES, WorkflowTemplate } from '../templates/workflow-templates.data';

@Injectable({
  providedIn: 'root'
})
export class WorkflowTemplateService {
  listarPlantillas(): WorkflowTemplate[] {
    return WORKFLOW_TEMPLATES.map((template) => ({ ...template }));
  }

  obtenerPlantillaParaEdicion(templateId: string): PoliticaNegocio | null {
    const template = WORKFLOW_TEMPLATES.find((item) => item.id === templateId);
    if (!template) {
      return null;
    }

    return {
      ...structuredClone(template.politica),
      id: undefined,
      version: 1,
      estado: 'BORRADOR',
      creadoPor: undefined,
      fechaCreacion: undefined
    };
  }
}
