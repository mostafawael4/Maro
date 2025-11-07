import { Routes } from '@angular/router';
import { HomeComponent } from './components/home/home.component';
import { PackagesComponent } from './components/packages/packages.component';
import { CinematographyComponent } from './components/packages/cinematography/cinematography.component';
import { PhotographyComponent } from './components/packages/photography/photography.component';
import { FullRecordingComponent } from './components/packages/full-recording/full-recording.component';
import { GalleryComponent } from './components/gallery/gallery.component';
import { ContactComponent } from './components/contact/contact.component';
import { AdminComponent } from './components/admin/admin.component';

export const routes: Routes = [
    { path: '', redirectTo: 'home', pathMatch: 'full' },
    { path: 'home', component: HomeComponent },
    { 
        path: 'packages', 
        component: PackagesComponent,
        children: [
            { path: '', redirectTo: 'cinematography', pathMatch: 'full' },
            { path: 'cinematography', component: CinematographyComponent },
            { path: 'photography', component: PhotographyComponent },
            { path: 'fullrecording', component: FullRecordingComponent }
        ]
    },
    { path: 'gallery', component: GalleryComponent },
    { path: 'contact', component: ContactComponent },
    { path: 'admin', component: AdminComponent },
];
