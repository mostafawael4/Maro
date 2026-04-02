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
  @Input() folderSizes: { [folderName: string]: number } = {};

  @Output() folderSelected = new EventEmitter<string>();
  @Output() folderDeleted = new EventEmitter<string>();
  @Output() folderDownload = new EventEmitter<string>();

  /** Convert bytes to a human-readable string, e.g. 1.3 GB */
  formatSize(bytes: number): string {
    if (!bytes) return '';
    if (bytes >= 1024 ** 3) return (bytes / 1024 ** 3).toFixed(1) + ' GB';
    if (bytes >= 1024 ** 2) return (bytes / 1024 ** 2).toFixed(1) + ' MB';
    if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return bytes + ' B';
  }

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

