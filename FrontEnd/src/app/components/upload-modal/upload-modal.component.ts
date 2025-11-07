import { Component, Output, EventEmitter, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GalleryService } from '../../services/gallery.service';

@Component({
  selector: 'app-upload-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './upload-modal.component.html',
  styleUrl: './upload-modal.component.scss'
})
export class UploadModalComponent {
  @Input() show: boolean = false;
  @Output() closeModal = new EventEmitter<void>();
  @Output() uploadComplete = new EventEmitter<void>();

  selectedFiles: File[] = [];
  isUploading: boolean = false;
  uploadSuccess: string = '';
  uploadError: string = '';
  isDragging: boolean = false;

  constructor(private galleryService: GalleryService) {}

  close() {
    this.closeModal.emit();
    this.resetModal();
  }

  resetModal() {
    this.selectedFiles = [];
    this.uploadSuccess = '';
    this.uploadError = '';
    this.isDragging = false;
  }

  onFileSelected(event: any) {
    const files = event.target.files;
    if (files && files.length > 0) {
      this.selectedFiles = Array.from(files);
      this.uploadError = '';
    }
  }

  // Drag and Drop handlers
  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = true;
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      // Filter to only accept image files
      const imageFiles = Array.from(files).filter(file => 
        file.type.startsWith('image/')
      );
      
      if (imageFiles.length > 0) {
        this.selectedFiles = imageFiles;
        this.uploadError = '';
      } else {
        this.uploadError = 'Please select valid image files';
      }
    }
  }

  removeFile(index: number) {
    this.selectedFiles.splice(index, 1);
  }

  uploadImages() {
    if (this.selectedFiles.length === 0) {
      this.uploadError = 'Please select at least one image to upload';
      return;
    }

    this.isUploading = true;
    this.uploadError = '';
    this.uploadSuccess = '';

    this.galleryService.uploadImages(this.selectedFiles).subscribe({
      next: (response) => {
        this.isUploading = false;
        this.uploadSuccess = `Successfully uploaded ${this.selectedFiles.length} image(s)!`;
        this.selectedFiles = [];
        
        // Notify parent component and close modal after delay
        setTimeout(() => {
          this.uploadComplete.emit();
          this.close();
        }, 1500);
      },
      error: (error) => {
        this.isUploading = false;
        this.uploadError = error.error?.message || 'Failed to upload images. Please try again.';
        console.error('Upload error:', error);
      }
    });
  }
}

