// =============================================================================
// Public landing page – hero, features, how-it-works, benefits, testimonials,
// FAQ, CTA and footer.
// =============================================================================
import { Component, HostListener, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NgIf } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatExpansionModule } from '@angular/material/expansion';
import { ThemeService } from '../../core/services/theme.service';

interface Feature {
  icon: string;
  title: string;
  text: string;
  tone: string;
}


interface Step {
  icon: string;
  title: string;
  text: string;
}

interface Testimonial {
  name: string;
  role: string;
  quote: string;
  color: string;
}

interface Faq {
  q: string;
  a: string;
}

const FEATURES: Feature[] = [
  {
    icon: 'monitor_heart',
    title: 'ML-Powered Risk Prediction',
    text: 'Machine learning analyzes 15+ clinical and sleep parameters to estimate coronary heart disease risk in seconds.',
    tone: '#E53935',
  },
  {
    icon: 'bedtime',
    title: 'Sleep-Aware Analysis',
    text: 'Sleep duration, quality, snoring and sleep disorders are weighted into every prediction — because sleep drives heart health.',
    tone: '#1565C0',
  },
  {
    icon: 'speed',
    title: 'Instant Results',
    text: 'Get a clear risk level with a confidence percentage and personalized recommendations right after submitting your data.',
    tone: '#43A047',
  },
  {
    icon: 'trending_up',
    title: 'Progress Tracking',
    text: 'Monitor your risk over time with prediction history, charts and an overall health score that moves as you improve.',
    tone: '#7B1FA2',
  },
  {
    icon: 'lock',
    title: 'Privacy First',
    text: 'Your health data is encrypted and protected with JWT-secured APIs. You own your information, always.',
    tone: '#F9A825',
  },
  {
    icon: 'picture_as_pdf',
    title: 'Shareable Reports',
    text: 'Download a professional PDF report or share your results with your cardiologist and family in one click.',
    tone: '#00897B',
  },
];

const STEPS: Step[] = [
  { icon: 'person_add', title: 'Create your account', text: 'Sign up in under a minute and set up your health profile securely.' },
  { icon: 'assignment', title: 'Enter your parameters', text: 'Fill the guided multi-step form with personal, lifestyle, clinical and sleep data.' },
  { icon: 'model_training', title: 'AI assesses risk', text: 'The ML engine evaluates 15+ factors and computes your CHD risk with confidence.' },
  { icon: 'health_and_safety', title: 'Act on insights', text: 'Review recommendations, share the PDF report, and track progress over time.' },
];

const TESTIMONIALS: Testimonial[] = [
  {
    name: 'Dr. Rajesh Iyer',
    role: 'Cardiologist, Apollo Hospitals',
    quote: 'CardioSight flags patients I used to catch months later. The sleep parameters add a dimension standard calculators miss.',
    color: '#1565C0',
  },
  {
    name: 'Sneha Kulkarni',
    role: 'Patient · Recovering from a risk spike',
    quote: 'The risk meter and weekly tips kept me disciplined. In four months my score dropped from 64 to 31.',
    color: '#E53935',
  },
  {
    name: 'Dr. Anil Mehta',
    role: 'Public Health Researcher',
    quote: 'The analytics dashboard is a goldmine for population-level heart disease studies. Clean UI and honest confidence scores.',
    color: '#43A047',
  },
];

const FAQS: Faq[] = [
  { q: 'Is CardioSight a substitute for medical advice?', a: 'No. CardioSight is a screening and awareness tool. It provides an evidence-informed risk estimate, but diagnosis and treatment decisions must always be made by qualified healthcare professionals.' },
  { q: 'How accurate are the predictions?', a: 'The underlying ML model reaches approximately 87% accuracy on validation data. Every prediction includes a confidence percentage so you can judge how strongly the model stands behind the result.' },
  { q: 'What data does CardioSight collect?', a: 'Only the personal, lifestyle, clinical and sleep parameters you enter, plus your account details. Your data is transmitted over HTTPS and protected with JWT authentication. We never sell or share it.' },
  { q: 'Can I use it to monitor my progress over time?', a: 'Yes. Every prediction is stored in your history with a risk score, so the dashboard and analytics charts show how your risk evolves and what factors improved it.' },
  { q: 'How is my risk level calculated?', a: 'Based on standard Framingham clinical guidelines, your estimated 10-year CHD risk is stratified as Low (< 10%), Intermediate/Moderate (10–19%), or High (≥ 20%).' },
  { q: 'Do I need to download anything?', a: 'No. CardioSight runs entirely in your browser and is fully responsive, so it works on desktop, tablet and mobile.' },
];

const STATS = [
  { value: 12500, suffix: '+', label: 'Predictions run', decimals: 0 },
  { value: 87, suffix: '%', label: 'Model accuracy', decimals: 0 },
  { value: 9400, suffix: '+', label: 'Active users', decimals: 0 },
  { value: 38, suffix: '%', label: 'Avg. risk reduction', decimals: 0 },
];

const GAUGE_LENGTH = 283;

@Component({
  selector: "app-landing-page",
  templateUrl: "./landing-page.component.html",
  styleUrl: "./landing-page.component.scss",
  standalone: true,
  imports: [
    RouterLink,
    NgIf,
    MatIconModule,
    MatExpansionModule,
  ],
})
export class LandingPageComponent {
  private readonly router = inject(Router);
  readonly theme = inject(ThemeService);

  readonly features = FEATURES;
  readonly steps = STEPS;
  readonly testimonials = TESTIMONIALS;
  readonly faqs = FAQS;
  readonly stats = STATS;
  readonly trustPeople = [
    "Aarav Sharma",
    "Priya Singh",
    "Dr. Meera Nair",
    "Rohan Verma",
  ];
  readonly progressBars = [64, 52, 47, 38, 33, 28];

  readonly statsVisible = signal(false);
  readonly heartImageFailed = signal(false);
  readonly scrolled = signal(false);
  readonly mobileMenuOpen = signal(false);

  get gaugeOffset(): number {
    return this.statsVisible() ? GAUGE_LENGTH * (1 - 0.28) : GAUGE_LENGTH;
  }

  barLabel(index: number): string {
    return ["Feb", "Mar", "Apr", "May", "Jun", "Jul"][index];
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen.update((value) => !value);
  }

  isMobileMenuOpen(): boolean {
    return this.mobileMenuOpen();
  }

  goAbout(): void {
    this.router.navigate(["/app/about"]);
  }

  @HostListener("window:scroll")
  onScroll(): void {
    this.scrolled.set(window.scrollY > 24);
  }
  scrollToSection(id: string): void {
    document.getElementById(id)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }
}
