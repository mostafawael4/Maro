import { Routes } from '@angular/router';
import { adminGuard } from './guards/admin.guard';
import { adminLoginGuard } from './guards/admin-login.guard';
import { authGuard } from './guards/auth.guard';
import { ordersAccessGuard } from './guards/orders-access.guard';

export const routes: Routes = [
    { path: '', redirectTo: 'home', pathMatch: 'full' },
    { path: 'home', loadComponent: () => import('./components/home/home.component').then(m => m.HomeComponent), data: { title: 'Home' } },
    { path: 'packages', loadComponent: () => import('./components/packages/packages.component').then(m => m.PackagesComponent), data: { title: 'Packages' } },
    { path: 'gallery', loadComponent: () => import('./components/gallery/gallery.component').then(m => m.GalleryComponent), data: { title: 'Gallery' } },
    { path: 'films', loadComponent: () => import('./components/films/films.component').then(m => m.FilmsComponent), data: { title: 'Films' } },
    { path: 'faqs', loadComponent: () => import('./components/faqs/faqs.component').then(m => m.FaqsComponent), data: { title: 'FAQs' } },
    { path: 'orders', loadComponent: () => import('./components/orders/orders.component').then(m => m.OrdersComponent), canActivate: [ordersAccessGuard], data: { title: 'Orders' } },
    { path: 'create-order', loadComponent: () => import('./components/create-order/create-order.component').then(m => m.CreateOrderComponent), data: { title: 'Create Order' } },
    { path: 'edit-order/:id', loadComponent: () => import('./components/create-order/create-order.component').then(m => m.CreateOrderComponent), data: { title: 'Edit Order' } },
    { path: 'order-details/:id', loadComponent: () => import('./components/order-details/order-details.component').then(m => m.OrderDetailsComponent), data: { title: 'Order Details' } },
    { path: 'dashboard', loadComponent: () => import('./components/dashboard/dashboard.component').then(m => m.DashboardComponent), canActivate: [adminGuard], data: { title: 'Dashboard' } },
    { path: 'order-info/:id', loadComponent: () => import('./components/order-info/order-info.component').then(m => m.OrderInfoComponent), data: { title: 'Order Info' } },
    { path: 'contact', loadComponent: () => import('./components/contact/contact.component').then(m => m.ContactComponent), data: { title: 'Contact' } },
    { path: 'admin', loadComponent: () => import('./components/admin/admin.component').then(m => m.AdminComponent), canActivate: [adminLoginGuard], data: { title: 'Admin' } },
    { path: 'feedbacks', loadComponent: () => import('./components/feedbacks/feedbacks.component').then(m => m.FeedbacksComponent), data: { title: 'Feedbacks' } },
    { path: 'calendar', loadComponent: () => import('./components/calendar/calendar.component').then(m => m.CalendarComponent), canActivate: [authGuard], data: { title: 'Calendar' } },
    { path: 'change-password', loadComponent: () => import('./components/change-password/change-password.component').then(m => m.ChangePasswordComponent), canActivate: [authGuard], data: { title: 'Change Password' } },
    { path: 'notfound', loadComponent: () => import('./components/not-found/not-found.component').then(m => m.NotFoundComponent), data: { title: 'Page Not Found' } }, 
    { path: '**', redirectTo: 'notfound' }, // 404 - must be last
];
