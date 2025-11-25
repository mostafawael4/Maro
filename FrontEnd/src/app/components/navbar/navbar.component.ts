import { Component, HostListener, Input, Inject, PLATFORM_ID, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { isPlatformBrowser } from '@angular/common';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss'
})
export class NavbarComponent implements OnInit {
  isMobileMenuOpen = false;
  isScrolled = false;
  isAuthenticated = false;
  isAdmin = false;
  isEditor = false;
  isDropdownOpen = false;
  isGalleryDropdownOpen = false;
  isClientReady = false;
  private isBrowser: boolean;
  @Input() navbarBgColor: string = 'rgba(255, 250, 245, 0.95)'; // Light warm cream with sunshine hint

  constructor(
    private authService: AuthService,
    public router: Router,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(this.platformId);
    if (this.isBrowser) {
      this.isAuthenticated = this.authService.isAuthenticatedValue;
      this.isAdmin = this.authService.isAdmin();
      this.isEditor = this.authService.isEditor();
    }

    // Subscribe to authentication state
    this.authService.isAuthenticated$.subscribe(isAuth => {
      this.isAuthenticated = isAuth ?? false;
      if (this.isBrowser) {
        this.isAdmin = this.authService.isAdmin();
        this.isEditor = this.authService.isEditor();
        this.cdr.markForCheck();
      }
      if (isPlatformBrowser(this.platformId)) {
        this.isClientReady = true;
      }
    });
    
    // Initialize admin status in browser
    if (this.isBrowser) {
      this.isAdmin = this.authService.isAdmin();
      this.isEditor = this.authService.isEditor();
    }
  }

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.isClientReady = true;
      // Refresh admin status on init
      this.isAdmin = this.authService.isAdmin();
      this.isEditor = this.authService.isEditor();
      this.cdr.markForCheck();
    }
  }

  @HostListener('window:scroll', ['$event'])
  onWindowScroll() {
    this.isScrolled = window.scrollY > 10;
  }

  toggleMobileMenu(): void {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
  }

  closeMobileMenu(): void {
    this.isMobileMenuOpen = false;
  }

  onLogout(): void {
    this.authService.logout().subscribe({
      next: () => {
        this.closeMobileMenu();
        this.router.navigate(['/']);
      },
      error: (error) => {
        console.error('Logout error:', error);
      }
    });
  }

  openDropdown(): void {
    this.isDropdownOpen = true;
  }

  closeDropdown(): void {
    this.isDropdownOpen = false;
  }

  openGalleryDropdown(): void {
    this.isGalleryDropdownOpen = true;
  }

  closeGalleryDropdown(): void {
    this.isGalleryDropdownOpen = false;
  }

}
