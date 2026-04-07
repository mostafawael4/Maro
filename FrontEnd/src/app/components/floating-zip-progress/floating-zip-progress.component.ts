import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OrdersService } from '../../services/orders.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-floating-zip-progress',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './floating-zip-progress.component.html',
  styleUrl: './floating-zip-progress.component.scss'
})
export class FloatingZipProgressComponent implements OnInit, OnDestroy {
  job: any = null;
  minimized = false;
  private destroy$ = new Subject<void>();

  constructor(private ordersService: OrdersService) {}

  ngOnInit(): void {
    this.ordersService.activeZipJob$
      .pipe(takeUntil(this.destroy$))
      .subscribe(job => {
        this.job = job;
        if (job && job.stage === 'preparing') {
           this.minimized = false; // Expand when a new job starts
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  download() {
    if (this.job?.downloadUrl) {
      window.open(this.job.downloadUrl, '_blank');
      // After download starts, we can either clear or keep it.
      // Keeping it "Ready" is fine in case they need to click again.
    }
  }

  close() {
    this.ordersService.clearActiveZipJob();
  }

  toggleMinimize() {
    this.minimized = !this.minimized;
  }
}
