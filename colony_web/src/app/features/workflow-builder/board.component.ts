import { ChangeDetectionStrategy, Component } from '@angular/core';
import { LienzoCarrilesComponent } from './components/lienzo-carriles/lienzo-carriles.component';

@Component({
  selector: 'app-board',
  standalone: true,
  imports: [LienzoCarrilesComponent],
  templateUrl: './board.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BoardComponent {}
