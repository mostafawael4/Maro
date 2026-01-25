import { Component, Output, EventEmitter, Input, ChangeDetectorRef, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable, Subscription } from 'rxjs';
import { HttpEventType } from '@angular/common/http';
import { WebsocketService } from '../../services/websocket.service';

@Component({
  selector: 'app-upload-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './upload-modal.component.html',
  styleUrl: './upload-modal.component.scss'
})
export class UploadModalComponent implements OnInit, OnDestroy {
  @Input() show: boolean = false;
  @Input() uploadFunction?: (files: File[]) => Observable<any>;
  @Output() closeModal = new EventEmitter<void>();
  @Output() uploadComplete = new EventEmitter<void>();

  selectedFiles: File[] = [];
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
  private uploadProgressSimulator: any = null;
  private wsSubscriptions: Subscription[] = [];

  constructor(
    private cdr: ChangeDetectorRef,
    private websocketService: WebsocketService
  ) {}


  ngOnInit() {
    // Connect to WebSocket when component initializes
    this.websocketService.connect();
    
    // Subscribe to WebSocket events
    const uploadCompleteSubscription = this.websocketService.onUploadComplete().subscribe((data) => {
      if (data) {
        console.log('Upload complete via WebSocket:', data);
        this.processingStatus = data.message || 'Upload completed!';
        this.cdr.markForCheck();
      }
    });

    const uploadFailureSubscription = this.websocketService.onUploadFailure().subscribe((data) => {
      if (data) {
        console.error('Upload failure via WebSocket:', data);
        this.uploadError = data.error || 'Upload failed';
        this.cdr.markForCheck();
      }
    });

    const processingStatusSubscription = this.websocketService.onProcessingStatus().subscribe((data) => {
      if (data) {
        console.log('Processing status via WebSocket:', data);
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
    // Unsubscribe from all WebSocket subscriptions
    this.wsSubscriptions.forEach(sub => sub.unsubscribe());
  }

  close() {
    this.closeModal.emit();
    this.resetModal();
  }

  resetModal() {
    this.selectedFiles = [];
    this.uploadSuccess = '';
    this.uploadError = '';
    this.isDragging = false;
    this.uploadProgress = 0;
    this.uploadProgressBytes = 0;
    this.uploadTotalBytes = 0;
    this.uploadElapsedTime = '0s';
    this.uploadSpeed = '0 Bytes';
    this.processingStatus = '';
    this.stopUploadTimeTracking();
    this.stopProgressSimulation();
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

    if (!this.uploadFunction) {
      this.uploadError = 'Upload function not provided';
      return;
    }

    this.isUploading = true;
    this.uploadError = '';
    this.uploadSuccess = '';
    
    // Calculate total file size
    this.uploadTotalBytes = this.selectedFiles.reduce((total, file) => total + file.size, 0);
    this.uploadProgressBytes = 0;
    this.uploadProgress = 0;
    this.uploadStartTime = Date.now();
    this.uploadElapsedTime = '0s';
    this.uploadSpeed = '0 Bytes';
    
    // Start time tracking
    this.startUploadTimeTracking();
    
    // Start progress simulation as fallback
    this.startProgressSimulation();

    this.uploadFunction(this.selectedFiles).subscribe({
      next: (event: any) => {
        // Handle progress events (type 1 = UploadProgress, type 3 = DownloadProgress)
        if (event.type === HttpEventType.UploadProgress || (event.type === 3 && event.loaded !== undefined)) {
          // Stop simulation since we have real progress
          this.stopProgressSimulation();
          if (event.total) {
            this.uploadProgressBytes = event.loaded;
            const calculatedProgress = Math.round((event.loaded / event.total) * 100);
            // If loaded equals or exceeds total, we're at 100%
            if (event.loaded >= event.total) {
              this.uploadProgress = 100;
              this.uploadProgressBytes = this.uploadTotalBytes;
            } else {
              this.uploadProgress = calculatedProgress;
            }
            this.updateUploadSpeed();
            this.cdr.markForCheck();
          }
        } 
        // Handle Response event (type 4 = Response)
        else if (event.type === HttpEventType.Response || event.type === 4) {
          // Stop simulation
          this.stopProgressSimulation();
          // Upload complete - ensure progress shows 100%
          this.uploadProgress = 100;
          this.uploadProgressBytes = this.uploadTotalBytes;
          this.updateUploadSpeed();
          this.cdr.markForCheck();
          
          // Small delay to show 100% before closing
          setTimeout(() => {
            this.stopUploadTimeTracking();
            this.isUploading = false;
            this.uploadSuccess = `Successfully uploaded ${this.selectedFiles.length} image(s)!`;
            this.selectedFiles = [];
            
            // Notify parent component and close modal after delay
            setTimeout(() => {
              this.uploadComplete.emit();
              this.close();
            }, 1500);
          }, 500);
        }
        // Handle any other event that might indicate completion
        else if (event.body && event.ok !== undefined) {
          // This might be a response wrapped differently
          this.stopProgressSimulation();
          this.uploadProgress = 100;
          this.uploadProgressBytes = this.uploadTotalBytes;
          this.updateUploadSpeed();
          this.cdr.markForCheck();
        }
      },
      error: (error) => {
        this.stopUploadTimeTracking();
        this.stopProgressSimulation();
        this.isUploading = false;
        this.uploadProgress = 0;
        this.uploadSpeed = '0 Bytes';
        this.uploadError = error.error?.error || error.error?.message || 'Failed to upload images. Please try again.';
        console.error('Upload error:', error);
      },
      complete: () => {
        // This is called when the observable completes
        // Ensure progress is at 100% if upload was successful
        if (this.isUploading && this.uploadProgress < 100) {
          this.uploadProgress = 100;
          this.uploadProgressBytes = this.uploadTotalBytes;
          this.updateUploadSpeed();
          this.cdr.markForCheck();
        }
      }
    });
  }

  startUploadTimeTracking(): void {
    this.uploadProgressInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.uploadStartTime) / 1000);
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      const newTime = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
      if (this.uploadElapsedTime !== newTime) {
        this.uploadElapsedTime = newTime;
        this.updateUploadSpeed();
        this.cdr.markForCheck();
      }
    }, 100);
  }

  stopUploadTimeTracking(): void {
    if (this.uploadProgressInterval) {
      clearInterval(this.uploadProgressInterval);
      this.uploadProgressInterval = null;
    }
  }

  startProgressSimulation(): void {
    // Simulate progress if real progress events don't fire
    let simulatedProgress = 0;
    this.uploadProgressSimulator = setInterval(() => {
      // Stop if upload is complete or cancelled
      if (this.uploadProgress >= 100 || !this.isUploading) {
        this.stopProgressSimulation();
        return;
      }
      
      // Only simulate if we haven't received real progress and haven't reached 95%
      if (this.uploadProgress < 95 && this.isUploading) {
        // Gradually increase progress up to 95% (leave room for completion)
        simulatedProgress += 1.5;
        if (simulatedProgress > 95) simulatedProgress = 95;
        
        // Only update if we haven't received real progress
        if (this.uploadProgress < simulatedProgress) {
          this.uploadProgress = Math.round(simulatedProgress);
          this.uploadProgressBytes = Math.round((this.uploadTotalBytes * simulatedProgress) / 100);
          this.updateUploadSpeed();
          this.cdr.markForCheck();
        }
      }
    }, 150);
  }

  stopProgressSimulation(): void {
    if (this.uploadProgressSimulator) {
      clearInterval(this.uploadProgressSimulator);
      this.uploadProgressSimulator = null;
    }
  }

  updateUploadSpeed(): void {
    if (this.uploadProgressBytes === 0 || this.uploadStartTime === 0) {
      this.uploadSpeed = '0 Bytes';
      return;
    }
    const elapsedSeconds = (Date.now() - this.uploadStartTime) / 1000;
    if (elapsedSeconds === 0) {
      this.uploadSpeed = '0 Bytes';
      return;
    }
    const bytesPerSecond = this.uploadProgressBytes / elapsedSeconds;
    this.uploadSpeed = this.formatBytes(Math.round(bytesPerSecond));
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }
}

