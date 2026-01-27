import { Routes } from '@angular/router';
import { adminGuard } from './guards/admin.guard';
import { adminLoginGuard } from './guards/admin-login.guard';
import { authGuard } from './guards/auth.guard';
import { ordersAccessGuard } from './guards/orders-access.guard';
import { HomeComponent } from './components/home/home.component';
import { PackagesComponent } from './components/packages/packages.component';
import { GalleryComponent } from './components/gallery/gallery.component';
import { FilmsComponent } from './components/films/films.component';
import { FaqsComponent } from './components/faqs/faqs.component';
import { OrdersComponent } from './components/orders/orders.component';
import { CreateOrderComponent } from './components/create-order/create-order.component';
import { OrderDetailsComponent } from './components/order-details/order-details.component';
import { OrderInfoComponent } from './components/order-info/order-info.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { ContactComponent } from './components/contact/contact.component';
import { AdminComponent } from './components/admin/admin.component';
import { FeedbacksComponent } from './components/feedbacks/feedbacks.component';
import { CalendarComponent } from './components/calendar/calendar.component';
import { ChangePasswordComponent } from './components/change-password/change-password.component';
import { NotFoundComponent } from './components/not-found/not-found.component';

export const routes: Routes = [
    { path: '', redirectTo: 'home', pathMatch: 'full' },
    { path: 'home', component: HomeComponent, data: { title: 'Home', description: 'Welcome to Maro Weddings - Capturing the essence of your special day with cinematic excellence.' } },
    { path: 'packages', component: PackagesComponent, data: { title: 'Pricing & Packages', description: 'Explore our comprehensive wedding photography and videography packages designed to fit your unique style.' } },
    { path: 'gallery', component: GalleryComponent, data: { title: 'Gallery', description: 'A collection of our finest wedding moments captured through our lens.' } },
    { path: 'films', component: FilmsComponent, data: { title: 'Films', description: 'Experience the magic of love through our cinematic wedding films.' } },
    { path: 'faqs', component: FaqsComponent, data: { title: 'FAQs', description: 'Find answers to common questions about our services and booking process.' } },
    { path: 'orders', component: OrdersComponent, canActivate: [ordersAccessGuard], data: { title: 'Orders', description: 'Manage your wedding service requests and order status.' } },
    { path: 'create-order', component: CreateOrderComponent, data: { title: 'Create Order', description: 'Start your journey with us by creating a new wedding service order.' } },
    { path: 'edit-order/:id', component: CreateOrderComponent, data: { title: 'Edit Order', description: 'Modify your existing wedding service order details.' } },
    { path: 'order-details/:id', component: OrderDetailsComponent, data: { title: 'Order Details', description: 'View the comprehensive details and status of your wedding service order.' } },
    { path: 'dashboard', component: DashboardComponent, canActivate: [adminGuard], data: { title: 'Dashboard', description: 'Admin dashboard for managing and tracking all client orders.' } },
    { path: 'order-info/:id', component: OrderInfoComponent, data: { title: 'Order Info', description: 'Detailed information and client logistics for a specific wedding order.' } },
    { path: 'contact', component: ContactComponent, data: { title: 'Contact', description: 'Get in touch with Maro Weddings for bookings and inquiries.' } },
    { path: 'admin', component: AdminComponent, canActivate: [adminLoginGuard], data: { title: 'Admin Login', description: 'Secure access for the Maro Weddings administrative team.' } },
    { path: 'feedbacks', component: FeedbacksComponent, data: { title: 'Feedbacks', description: 'Read what our happy couples have to say about their Maro Weddings experience.' } },
    { path: 'calendar', component: CalendarComponent, canActivate: [authGuard], data: { title: 'Calendar', description: 'Bookings and event schedule overview.' } },
    { path: 'change-password', component: ChangePasswordComponent, canActivate: [authGuard], data: { title: 'Change Password', description: 'Securely update your account credentials.' } },
    { path: 'notfound', component: NotFoundComponent, data: { title: 'Page Not Found', description: 'The page you are looking for does not exist.' } },
    { path: '**', redirectTo: 'notfound' }, // 404 - must be last
];
