import { Component, Output, EventEmitter, Input, ChangeDetectorRef, OnInit, OnDestroy, PLATFORM_ID, inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable, Subscription } from 'rxjs';
import { HttpEventType } from '@angular/common/http';
import { WebsocketService } from '../../services/websocket.service';

@Component({
  selector: 'app-film-upload-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './film-upload-modal.component.html',
  styleUrl: './film-upload-modal.component.scss'
})
export class FilmUploadModalComponent implements OnInit, OnDestroy {
  @Input() show: boolean = false;
  @Input() uploadFunction?: (file: File, description: string) => Observable<any>;
  @Output() closeModal = new EventEmitter<void>();
  @Output() uploadComplete = new EventEmitter<void>();

  selectedFile: File | null = null;
  description: string = '';
  isUploading: boolean = false;
  uploadSuccess: string = '';
  uploadError: string = '';
  isDragging: boolean = false;
  processingStatus: string = '';

  // Progress tracking
  uploadProgress: number = 0;
  uploadProgressBytes: number = 0;
  uploadTotalBytes: number = 0;
  uploadStartTime: number = 0;
  uploadElapsedTime: string = '0s';
  uploadSpeed: string = '0 Bytes';
  private uploadProgressInterval: any = null;
  private wsSubscriptions: Subscription[] = [];
  private platformId = inject(PLATFORM_ID);
  private isBrowser: boolean;

  constructor(
    private cdr: ChangeDetectorRef,
    private websocketService: WebsocketService
  ) {
    this.isBrowser = isPlatformBrowser(this.platformId);
  }

  ngOnInit() {
    // Only initialize WebSocket in browser environment
    if (!this.isBrowser) {
      return;
    }

    this.websocketService.connect();

    const uploadCompleteSubscription = this.websocketService.onUploadComplete().subscribe((data) => {
      if (data && data.context === 'film') {
        console.log('Film upload complete via WebSocket:', data);
        this.processingStatus = data.message || 'Film uploaded!';
        this.cdr.markForCheck();
      }
    });

    const uploadFailureSubscription = this.websocketService.onUploadFailure().subscribe((data) => {
      if (data && data.context === 'film') {
        console.error('Film upload failure via WebSocket:', data);
        this.uploadError = data.error || 'Upload failed';
        this.cdr.markForCheck();
      }
    });

    const processingStatusSubscription = this.websocketService.onProcessingStatus().subscribe((data) => {
      if (data && data.context === 'film') {
        console.log('Film processing status via WebSocket:', data);
        this.processingStatus = data.message || '';
        this.cdr.markForCheck();
      }
    });

    this.wsSubscriptions.push(
      uploadCompleteSubscription,
      uploadFailureSubscription,
      processingStatusSubscription
    );
  }

  ngOnDestroy() {
    this.wsSubscriptions.forEach(sub => sub.unsubscribe());
  }

  close() {
    this.closeModal.emit();
    this.resetModal();
  }

  resetModal() {
    this.selectedFile = null;
    this.description = '';
    this.isUploading = false;
    this.uploadSuccess = '';
    this.uploadError = '';
    this.uploadProgress = 0;
    this.uploadProgressBytes = 0;
    this.uploadTotalBytes = 0;
    this.stopUploadTimeTracking();
  }

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
      const file = files[0];
      if (this.isVideoFile(file)) {
        this.selectedFile = file;
        this.uploadTotalBytes = file.size;
        this.uploadError = '';
      } else {
        this.uploadError = 'Please select a video file.';
      }
    }
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      if (this.isVideoFile(file)) {
        this.selectedFile = file;
        this.uploadTotalBytes = file.size;
        this.uploadError = '';
      } else {
        this.uploadError = 'Please select a video file.';
      }
    }
  }

  isVideoFile(file: File): boolean {
    return file.type.startsWith('video/');
  }

  removeFile() {
    this.selectedFile = null;
    this.uploadTotalBytes = 0;
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  startUploadTimeTracking() {
    this.uploadStartTime = Date.now();
    this.uploadProgressInterval = setInterval(() => {
      const elapsed = (Date.now() - this.uploadStartTime) / 1000;
      this.uploadElapsedTime = `${Math.floor(elapsed)}s`;
      this.updateUploadSpeed();
      this.cdr.markForCheck();
    }, 100);
  }

  stopUploadTimeTracking() {
    if (this.uploadProgressInterval) {
      clearInterval(this.uploadProgressInterval);
      this.uploadProgressInterval = null;
    }
  }

  updateUploadSpeed() {
    if (this.uploadElapsedTime !== '0s' && this.uploadProgressBytes > 0) {
      const elapsedSeconds = (Date.now() - this.uploadStartTime) / 1000;
      if (elapsedSeconds > 0) {
        const speed = this.uploadProgressBytes / elapsedSeconds;
        this.uploadSpeed = this.formatBytes(speed);
      }
    }
  }

  uploadFilm() {
    if (!this.selectedFile) {
      this.uploadError = 'Please select a video file.';
      return;
    }

    if (!this.description || this.description.trim() === '') {
      this.uploadError = 'Description is required.';
      return;
    }

    if (!this.uploadFunction) {
      this.uploadError = 'Upload function not provided.';
      return;
    }

    this.isUploading = true;
    this.uploadError = '';
    this.uploadSuccess = '';
    this.uploadProgress = 0;
    this.uploadProgressBytes = 0;
    this.startUploadTimeTracking();

    this.uploadFunction(this.selectedFile, this.description).subscribe({
      next: (event: any) => {
        if (event.type === HttpEventType.UploadProgress) {
          if (event.total) {
            this.uploadProgress = Math.round((100 * event.loaded) / event.total);
            this.uploadProgressBytes = event.loaded;
            this.updateUploadSpeed();
            this.cdr.markForCheck();
          }
        } else if (event.type === HttpEventType.Response || event.type === 4) {
          this.stopUploadTimeTracking();
          this.uploadProgress = 100;
          this.uploadProgressBytes = this.uploadTotalBytes;
          this.updateUploadSpeed();
          this.cdr.markForCheck();

          setTimeout(() => {
            this.stopUploadTimeTracking();
            this.isUploading = false;
            this.uploadSuccess = 'Film uploaded successfully!';
            this.selectedFile = null;
            this.description = '';

            setTimeout(() => {
              this.uploadComplete.emit();
              this.close();
            }, 1500);
          }, 500);
        }
      },
      error: (error) => {
        this.stopUploadTimeTracking();
        this.isUploading = false;
        this.uploadProgress = 0;
        this.uploadSpeed = '0 Bytes';
        this.uploadError = error.error?.error || error.error?.message || 'Failed to upload film. Please try again.';
        console.error('Upload error:', error);
      },
      complete: () => {
        if (!this.isUploading && this.uploadProgress === 100) {
          this.stopUploadTimeTracking();
        }
      }
    });
  }
}

