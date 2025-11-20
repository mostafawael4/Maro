import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-delete-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './delete-modal.component.html',
  styleUrl: './delete-modal.component.scss'
})
export class DeleteModalComponent {
  @Input() isOpen: boolean = false;
  @Input() title: string = 'Delete Order';
  @Input() message: string = 'Are you sure you want to delete this order?';
  @Input() warning: string = 'This action cannot be undone.';
  @Input() isLoading: boolean = false;
  
  @Output() confirm = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();

  onConfirm(): void {
    if (!this.isLoading) {
      this.confirm.emit();
    }
  }

  onCancel(): void {
    if (!this.isLoading) {
      this.cancel.emit();
    }
  }

  onOverlayClick(): void {
    if (!this.isLoading) {
      this.cancel.emit();
    }
  }
}

