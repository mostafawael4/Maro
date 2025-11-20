import { Component, OnInit, AfterViewInit, OnDestroy, PLATFORM_ID, Inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FilmsService, Film } from '../../services/films.service';
import { AuthService } from '../../services/auth.service';
import { environment } from '../../../environments/environment';
import { DeleteModalComponent } from '../delete-modal/delete-modal.component';
import { FilmUploadModalComponent } from '../film-upload-modal/film-upload-modal.component';
import { FilmVideoPosterSelectorComponent } from '../film-video-poster-selector/film-video-poster-selector.component';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-films',
  standalone: true,
  imports: [CommonModule, DeleteModalComponent, FilmUploadModalComponent, FilmVideoPosterSelectorComponent],
  templateUrl: './films.component.html',
  styleUrl: './films.component.scss'
})
export class FilmsComponent implements OnInit, AfterViewInit, OnDestroy {
  films: Film[] = [];
  visibleFilms: Set<number> = new Set();
  isLoading: boolean = true;
  errorMessage: string = '';
  isAuthenticated: boolean = false;
  isAdmin: boolean = false;
  showDeleteModal: boolean = false;
  showUploadModal: boolean = false;
  showVideoPosterSelector: boolean = false;
  filmToDelete: Film | null = null;
  selectedFilmForThumbnail: Film | null = null;
  deletingFilmId: string | null = null;
  deleteModalLoading = false;
  private intersectionObserver?: IntersectionObserver;
  private isBrowser: boolean;

  constructor(
    private filmsService: FilmsService,
    private authService: AuthService,
    @Inject(PLATFORM_ID) platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit() {
    this.loadFilms();
    
    // Check authentication status
    this.authService.isAuthenticated$.subscribe(isAuth => {
      this.isAuthenticated = isAuth ?? false;
      this.isAdmin = this.authService.isAdmin();
    });
    
    // Initialize admin status
    if (this.isBrowser) {
      this.isAdmin = this.authService.isAdmin();
    }
  }

  ngAfterViewInit() {
    // Setup Intersection Observer for scroll animations (browser only)
    if (this.isBrowser) {
      setTimeout(() => {
        this.setupIntersectionObserver();
        this.observeAllFilms();
      }, 50);
    }
  }

  ngOnDestroy() {
    // Clean up observer
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
    }
  }

  setupIntersectionObserver() {
    if (!this.isBrowser) return;
    
    const options = {
      root: null,
      rootMargin: '100px', // Start animation earlier (when element is 100px away from viewport)
      threshold: 0.1
    };

    this.intersectionObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const element = entry.target as HTMLElement;
          const index = parseInt(element.getAttribute('data-index') || '0', 10);
          // Add slight delay based on index for staggered effect
          setTimeout(() => {
            this.visibleFilms.add(index);
          }, index * 100); // Stagger each film by 100ms
          
          // Once animated, stop observing this element
          if (this.intersectionObserver) {
            this.intersectionObserver.unobserve(element);
          }
        }
      });
    }, options);
  }

  observeFilm(element: HTMLElement) {
    if (this.intersectionObserver && element) {
      this.intersectionObserver.observe(element);
    }
  }

  isFilmVisible(index: number): boolean {
    return this.visibleFilms.has(index);
  }

  loadFilms() {
    this.isLoading = true;
    this.filmsService.getAllFilms().subscribe({
      next: (films) => {
        this.films = films;
        this.isLoading = false;
        
        // Re-setup observer after films are loaded (browser only)
        if (this.isBrowser) {
          setTimeout(() => {
            this.setupIntersectionObserver();
            this.observeAllFilms();
          }, 100);
        }
      },
      error: (error) => {
        console.error('Error loading films:', error);
        this.errorMessage = 'Failed to load films. Please try again later.';
        this.isLoading = false;
      }
    });
  }

  observeAllFilms() {
    if (!this.isBrowser) return;
    
    const filmItems = document.querySelectorAll('.film-item');
    filmItems.forEach((item) => {
      this.observeFilm(item as HTMLElement);
    });
  }

  getFilmUrl(film: Film): string {
    // If the URL is relative, prepend the backend URL
    if (film.url.startsWith('/')) {
      return `${environment.apiUrl}${film.url}`;
    }
    return film.url;
  }

  getThumbnailUrl(film: Film): string | null {
    if (!film.thumbnail) {
      return null;
    }
    // If the thumbnail URL is relative, prepend the backend URL
    if (film.thumbnail.startsWith('/')) {
      return `${environment.apiUrl}${film.thumbnail}`;
    }
    return film.thumbnail;
  }

  // Delete modal methods
  onDeleteClick(film: Film, event: Event): void {
    event.stopPropagation();
    this.filmToDelete = film;
    this.showDeleteModal = true;
  }

  onConfirmDelete(): void {
    if (!this.filmToDelete || this.deleteModalLoading) {
      return;
    }
    this.deleteFilm(this.filmToDelete);
  }

  onCancelDelete(): void {
    if (this.deleteModalLoading) {
      return;
    }
    this.showDeleteModal = false;
    this.filmToDelete = null;
  }

  // Delete film method
  deleteFilm(film: Film): void {
    this.deleteModalLoading = true;
    this.deletingFilmId = film._id;
    
    // Use the film's _id to delete - backend will find the record and use the filename from the database
    this.filmsService.deleteFilm(film._id).subscribe({
      next: () => {
        // Find the index before deletion
        const index = this.films.findIndex(f => f._id === film._id);
        
        // Remove the film from the array
        this.films = this.films.filter(f => f._id !== film._id);
        this.deletingFilmId = null;
        this.filmToDelete = null;
        this.deleteModalLoading = false;
        this.showDeleteModal = false;
        
        // Clean up visible films tracking
        if (index !== -1) {
          this.visibleFilms.delete(index);
        }
        
        // Re-observe films after deletion (browser only)
        if (this.isBrowser) {
          setTimeout(() => {
            this.observeAllFilms();
          }, 100);
        }
      },
      error: (error) => {
        console.error('Error deleting film:', error);
        alert('Failed to delete film. Please try again.');
        this.deletingFilmId = null;
        this.deleteModalLoading = false;
      }
    });
  }

  isDeleting(filmId: string): boolean {
    return this.deletingFilmId === filmId;
  }

  // Upload modal methods
  openUploadModal() {
    this.showUploadModal = true;
  }

  closeUploadModal() {
    this.showUploadModal = false;
  }

  onUploadComplete() {
    // Reload films after successful upload
    this.loadFilms();
  }

  // Upload function to pass to FilmUploadModalComponent
  uploadFilm(file: File, description: string): Observable<any> {
    return this.filmsService.uploadFilm(file, description);
  }

  // Thumbnail selector methods
  onSelectVideoThumbnail(film: Film, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.selectedFilmForThumbnail = film;
    this.showVideoPosterSelector = true;
  }

  onThumbnailSelected(data: { thumbnail: string; thumbnailFilename: string }): void {
    if (!this.selectedFilmForThumbnail) return;
    
    // Update the film in the local array
    const filmIndex = this.films.findIndex(f => f._id === this.selectedFilmForThumbnail?._id);
    if (filmIndex !== -1) {
      this.films[filmIndex].thumbnail = data.thumbnail;
      this.films[filmIndex].thumbnailFilename = data.thumbnailFilename;
    }

    // Reload films to ensure we have the latest data
    this.loadFilms();
  }

  onCloseVideoPosterSelector(): void {
    this.showVideoPosterSelector = false;
    this.selectedFilmForThumbnail = null;
  }
}

