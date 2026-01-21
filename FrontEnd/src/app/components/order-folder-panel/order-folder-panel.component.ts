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
  @Input() isAuthenticated: boolean = false;
  @Input() zippingFolder: boolean = false;

  @Output() folderSelected = new EventEmitter<string>();
  @Output() folderDeleted = new EventEmitter<string>();
  @Output() folderDownload = new EventEmitter<string>();

  onFolderClick(folder: string, event: Event): void {
    event.stopPropagation();
    this.folderSelected.emit(folder);
  }

  onDeleteFolder(folder: string, event: Event): void {
    event.stopPropagation();
    this.folderDeleted.emit(folder);
  }

  onDownloadFolder(folder: string, event: Event): void {
    event.stopPropagation();
    this.folderDownload.emit(folder);
  }
}

