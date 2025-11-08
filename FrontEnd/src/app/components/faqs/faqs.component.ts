import { Component, OnInit, AfterViewInit, OnDestroy, PLATFORM_ID, Inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';

interface FAQ {
  question: string;
  answer: string;
}

@Component({
  selector: 'app-faqs',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './faqs.component.html',
  styleUrl: './faqs.component.scss'
})
export class FaqsComponent implements OnInit, AfterViewInit, OnDestroy {
  faqs: FAQ[] = [
    {
      question: 'What is the normal delivery time for a wedding video & pics?',
      answer: 'You\'ll receive all finalized videos and photos within 30 to 45 days of your wedding date.'
    },
    {
      question: 'How can you receive the full recording video?',
      answer: 'Your full recording will be delivered to you on a USB flash drive.'
    },
    {
      question: 'Do you offer custom packages?',
      answer: 'Yes, we do! If you have specific requests or a vision in mind, don\'t hesitate to share them with us. We\'re open to anything. Just let us know what you\'re looking for, and we\'ll make sure it\'s the perfect fit for you.'
    }
  ];

  // Animation states
  private visibleElements: Set<string> = new Set();
  private intersectionObserver?: IntersectionObserver;
  private isBrowser: boolean;

  constructor(@Inject(PLATFORM_ID) platformId: Object) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit(): void {
    // Scroll to top when component loads
    if (this.isBrowser) {
      window.scrollTo(0, 0);
    }
  }

  ngAfterViewInit(): void {
    if (this.isBrowser) {
      setTimeout(() => {
        this.setupIntersectionObserver();
        this.observeAllElements();
      }, 100);
    }
  }

  ngOnDestroy(): void {
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
    }
  }

  setupIntersectionObserver(): void {
    if (!this.isBrowser) return;

    const options = {
      root: null,
      rootMargin: '50px',
      threshold: 0.1
    };

    this.intersectionObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const element = entry.target as HTMLElement;
          const type = element.getAttribute('data-type');
          
          if (type) {
            setTimeout(() => {
              this.visibleElements.add(type);
            }, 0);
          }
        }
      });
    }, options);
  }

  observeAllElements(): void {
    if (!this.isBrowser) return;

    // Observe intro section
    const intro = document.querySelector('[data-type="intro"]');
    if (intro && this.intersectionObserver) {
      this.intersectionObserver.observe(intro as HTMLElement);
    }

    // Observe FAQ items
    const faqItems = document.querySelectorAll('.faq-item');
    faqItems.forEach((item) => {
      if (this.intersectionObserver) {
        this.intersectionObserver.observe(item as HTMLElement);
      }
    });
  }

  isVisible(type: string): boolean {
    return this.visibleElements.has(type);
  }
}

