import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-success-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './success-modal.component.html',
  styleUrl: './success-modal.component.scss'
})
export class SuccessModalComponent {
  @Input() isOpen: boolean = false;
  @Input() title: string = 'Success!';
  @Input() message: string = 'Operation completed successfully.';
  
  @Output() close = new EventEmitter<void>();

  onClose(): void {
    this.close.emit();
  }

  onOverlayClick(): void {
    this.close.emit();
  }
}

