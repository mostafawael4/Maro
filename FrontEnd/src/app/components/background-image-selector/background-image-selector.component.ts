import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OrdersService, OrderImage } from '../../services/orders.service';
import { environment } from '../../../environments/environment';
import { SuccessModalComponent } from '../success-modal/success-modal.component';

@Component({
  selector: 'app-background-image-selector',
  standalone: true,
  imports: [CommonModule, SuccessModalComponent],
  templateUrl: './background-image-selector.component.html',
  styleUrl: './background-image-selector.component.scss'
})
export class BackgroundImageSelectorComponent {
  @Input() orderId!: string;
  @Input() images: OrderImage[] = [];
  @Input() currentBackgroundImage?: string;
  @Output() imageSelected = new EventEmitter<{ backgroundImage: string; backgroundImageFilename: string }>();
  @Output() close = new EventEmitter<void>();

  baseUrl = environment.apiUrl;
  isUpdating: boolean = false;
  error: string = '';
  selectedImageFilename: string | null = null;
  showSuccessModal: boolean = false;
  showErrorModal: boolean = false;
  successMessage: string = 'Background image updated successfully!';
  errorMessage: string = 'Failed to update background image. Please try again.';

  constructor(private ordersService: OrdersService) {}

  getImageUrl(image: OrderImage): string {
    return `${image.url}`;
  }

  getDisplayName(image: OrderImage): string {
    // Return originalName if available, otherwise fall back to filename
    return image.originalName || image.filename;
  }

  isSelected(image: OrderImage): boolean {
    return image.filename === this.currentBackgroundImage?.split('/').pop() || 
           image.filename === this.selectedImageFilename;
  }

  selectImage(image: OrderImage): void {
    if (this.isUpdating) return;
    this.selectedImageFilename = image.filename;
    this.error = '';
  }

  confirmSelection(): void {
    if (!this.selectedImageFilename || this.isUpdating) return;

    const selectedImage = this.images.find(img => img.filename === this.selectedImageFilename);
    if (!selectedImage) {
      this.error = 'Selected image not found';
      return;
    }

    this.isUpdating = true;
    this.error = '';

    this.ordersService.updateOrderBackgroundImage(this.orderId, selectedImage.filename).subscribe({
      next: (response: { ok: boolean; backgroundImage: string; backgroundImageFilename: string }) => {
        if (response.ok) {
          this.imageSelected.emit({
            backgroundImage: response.backgroundImage,
            backgroundImageFilename: response.backgroundImageFilename
          });
          this.showSuccessModal = true;
        } else {
          this.errorMessage = 'Failed to update background image. Please try again.';
          this.showErrorModal = true;
        }
        this.isUpdating = false;
      },
      error: (err: any) => {
        console.error('Error updating background image:', err);
        this.error = err.error?.message || 'Failed to update background image. Please try again.';
        this.errorMessage = err.error?.message || 'Failed to update background image. Please try again.';
        this.showErrorModal = true;
        this.isUpdating = false;
      }
    });
  }

  onClose(): void {
    this.close.emit();
  }

  onSuccessModalClose(): void {
    this.showSuccessModal = false;
    this.onClose(); // Close the selector modal after success
  }

  onErrorModalClose(): void {
    this.showErrorModal = false;
  }
}

