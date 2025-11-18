import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-order-folder-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './order-folder-panel.component.html',
  styleUrl: './order-folder-panel.component.scss'
})
export class OrderFolderPanelComponent {
  @Input() folders: string[] = [];
  @Input() loading: boolean = false;
  @Input() error: string = '';
  @Input() selectedFolder: string | null = null;

  @Output() folderSelected = new EventEmitter<string>();

  onFolderClick(folder: string): void {
    this.folderSelected.emit(folder);
  }
}

