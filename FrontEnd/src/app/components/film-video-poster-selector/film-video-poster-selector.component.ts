import { Component, Input, Output, EventEmitter, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FilmsService } from '../../services/films.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-film-video-poster-selector',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './film-video-poster-selector.component.html',
  styleUrl: './film-video-poster-selector.component.scss'
})
export class FilmVideoPosterSelectorComponent implements OnInit {
  @Input() filmId!: string;
  @Input() videoFilename!: string;
  @Input() videoUrl!: string;
  @Input() currentThumbnail?: string;
  @Output() thumbnailSelected = new EventEmitter<{ thumbnail: string; thumbnailFilename: string }>();
  @Output() close = new EventEmitter<void>();

  @ViewChild('videoPlayer', { static: false }) videoPlayer!: ElementRef<HTMLVideoElement>;

  baseUrl = environment.apiUrl;
  videoDuration: number = 0;
  currentTime: number = 0;
  isExtracting: boolean = false;
  error: string = '';
  previewThumbnail: string | null = null;
  extractedThumbnailData: { thumbnail: string; thumbnailFilename: string } | null = null;

  constructor(private filmsService: FilmsService) {}

  ngOnInit(): void {
    // Duration will be loaded from video element metadata
  }

  onVideoLoaded(): void {
    if (this.videoPlayer?.nativeElement) {
      const duration = this.videoPlayer.nativeElement.duration;
      if (duration && isFinite(duration)) {
        this.videoDuration = duration;
      }
    }
  }

  onLoadedMetadata(): void {
    // This event fires when video metadata is loaded
    if (this.videoPlayer?.nativeElement) {
      const duration = this.videoPlayer.nativeElement.duration;
      if (duration && isFinite(duration)) {
        this.videoDuration = duration;
      }
    }
  }

  onTimeUpdate(): void {
    if (this.videoPlayer?.nativeElement) {
      this.currentTime = this.videoPlayer.nativeElement.currentTime;
    }
  }

  seekToTime(time: number): void {
    if (this.videoPlayer?.nativeElement) {
      this.videoPlayer.nativeElement.currentTime = time;
      this.currentTime = time;
    }
  }

  extractThumbnailAtCurrentTime(): void {
    if (!this.videoPlayer?.nativeElement) return;
    
    const timeInSeconds = this.videoPlayer.nativeElement.currentTime;
    if (timeInSeconds <= 0 || timeInSeconds >= this.videoDuration) {
      this.error = 'Please select a valid time in the video';
      return;
    }

    this.isExtracting = true;
    this.error = '';
    this.previewThumbnail = null;

    this.filmsService.extractFilmThumbnail(this.filmId, timeInSeconds).subscribe({
      next: (response) => {
        if (response.ok) {
          this.previewThumbnail = `${response.thumbnail}`;
          this.extractedThumbnailData = {
            thumbnail: response.thumbnail,
            thumbnailFilename: response.thumbnailFilename
          };
          this.isExtracting = false;
        }
      },
      error: (err) => {
        console.error('Error extracting thumbnail:', err);
        this.error = err.error?.message || 'Failed to extract thumbnail. Please try again.';
        this.isExtracting = false;
      }
    });
  }

  confirmThumbnail(): void {
    if (this.extractedThumbnailData) {
      // Set the thumbnail and close the modal
      this.thumbnailSelected.emit(this.extractedThumbnailData);
      setTimeout(() => {
        this.closeModal();
      }, 300);
    }
  }

  formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  closeModal(): void {
    this.close.emit();
  }
}

