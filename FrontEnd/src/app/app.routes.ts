import { Routes } from '@angular/router';
import { HomeComponent } from './components/home/home.component';
import { PackagesComponent } from './components/packages/packages.component';
import { GalleryComponent } from './components/gallery/gallery.component';
import { ContactComponent } from './components/contact/contact.component';
import { AdminComponent } from './components/admin/admin.component';
import { FaqsComponent } from './components/faqs/faqs.component';
import { OrdersComponent } from './components/orders/orders.component';
import { OrderDetailsComponent } from './components/order-details/order-details.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { OrderInfoComponent } from './components/order-info/order-info.component';
import { CreateOrderComponent } from './components/create-order/create-order.component';
import { FeedbacksComponent } from './components/feedbacks/feedbacks.component';
import { NotFoundComponent } from './components/not-found/not-found.component';
import { CalendarComponent } from './components/calendar/calendar.component';
import { adminGuard } from './guards/admin.guard';
import { adminLoginGuard } from './guards/admin-login.guard';

export const routes: Routes = [
    { path: '', redirectTo: 'home', pathMatch: 'full' },
    { path: 'home', component: HomeComponent },
    { path: 'packages', component: PackagesComponent },
    { path: 'gallery', component: GalleryComponent },
    { path: 'faqs', component: FaqsComponent },
    { path: 'orders', component: OrdersComponent },
    { path: 'create-order', component: CreateOrderComponent },
    { path: 'edit-order/:id', component: CreateOrderComponent },
    { path: 'order-details/:id', component: OrderDetailsComponent },
    { path: 'dashboard', component: DashboardComponent, canActivate: [adminGuard] },
    { path: 'order-info/:id', component: OrderInfoComponent },
    { path: 'contact', component: ContactComponent },
    { path: 'admin', component: AdminComponent, canActivate: [adminLoginGuard] },
    { path: 'feedbacks', component: FeedbacksComponent },
    { path: 'calendar', component: CalendarComponent, canActivate: [adminGuard] },
    { path: '**', component: NotFoundComponent }, // 404 - must be last
];
