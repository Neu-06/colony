import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PanelPropiedadesComponent } from './components/panel-propiedades/panel-propiedades.component';

@Component({
  selector: 'app-config-panel',
  standalone: true,
  imports: [PanelPropiedadesComponent],
  templateUrl: './config-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ConfigPanelComponent {}
