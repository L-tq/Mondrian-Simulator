import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

// ---------------------------------------------------------------------------
// Hero Mondrian grid — generate & animate a composition as the hero backdrop
// ---------------------------------------------------------------------------

const MONDRIAN_COLORS = ['#F8F6F0', '#F8F6F0', '#F8F6F0', '#F8F6F0', '#F8F6F0',
                          '#C82020', '#1E5090', '#E8C800', '#141414'];

interface Block {
  el: HTMLDivElement;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}

function createHeroGrid(): Block[] {
  const container = document.getElementById('hero-mondrian');
  if (!container) return [];

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const blocks: Block[] = [];

  // Subdivide the viewport recursively to create a Mondrian-like layout
  function subdivide(x: number, y: number, w: number, h: number, depth: number) {
    if (depth > 5 || (w < 120 && h < 120) || (depth > 2 && Math.random() < 0.45)) {
      const el = document.createElement('div');
      el.className = 'mondrian-block';
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;

      // Assign color — mostly white with occasional primaries
      const roll = Math.random();
      let color: string;
      if (roll < 0.12) color = '#C82020';
      else if (roll < 0.20) color = '#1E5090';
      else if (roll < 0.28) color = '#E8C800';
      else if (roll < 0.30) color = '#141414';
      else color = '#F8F6F0';

      el.style.background = color;
      if (color === '#141414') el.dataset.color = 'black';
      else if (color === '#C82020') el.dataset.color = 'red';
      else if (color === '#1E5090') el.dataset.color = 'blue';
      else if (color === '#E8C800') el.dataset.color = 'yellow';

      container!.appendChild(el);
      blocks.push({ el, x, y, w, h, color });
      return;
    }

    const horizontal = Math.random() < 0.5;
    const gapPx = 6 + Math.random() * 10;

    if (horizontal && h > 180) {
      const split = 0.25 + Math.random() * 0.5;
      const top = h * split;
      subdivide(x, y, w, top - gapPx / 2, depth + 1);
      subdivide(x, y + top + gapPx / 2, w, h - top - gapPx / 2, depth + 1);
    } else if (!horizontal && w > 180) {
      const split = 0.25 + Math.random() * 0.5;
      const left = w * split;
      subdivide(x, y, left - gapPx / 2, h, depth + 1);
      subdivide(x + left + gapPx / 2, y, w - left - gapPx / 2, h, depth + 1);
    } else if (w > 180) {
      const split = 0.3 + Math.random() * 0.4;
      const left = w * split;
      subdivide(x, y, left - gapPx / 2, h, depth + 1);
      subdivide(x + left + gapPx / 2, y, w - left - gapPx / 2, h, depth + 1);
    }
  }

  subdivide(0, 0, vw, vh, 0);
  return blocks;
}

// ---------------------------------------------------------------------------
// Reduced-motion check
// ---------------------------------------------------------------------------

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  const reduceMotion = prefersReducedMotion();

  // -- Hero grid -----------------------------------------------------------
  const blocks = createHeroGrid();

  if (!reduceMotion) {
    // Animate grid blocks in
    gsap.from(blocks.map(b => b.el), {
      scale: 0,
      autoAlpha: 0,
      duration: 0.7,
      stagger: {
        amount: 1.2,
        from: 'random',
      },
      ease: 'power3.out',
    });

    // Title character stagger
    const titleChars = document.querySelectorAll<HTMLElement>('.hero-title-char');
    gsap.from(titleChars, {
      y: 80,
      autoAlpha: 0,
      rotationX: -40,
      duration: 0.8,
      stagger: { amount: 0.8, from: 'start' },
      ease: 'back.out(1.4)',
      delay: 0.5,
    });

    // Subtitle
    gsap.from('.hero-subtitle', {
      y: 30,
      autoAlpha: 0,
      duration: 0.7,
      ease: 'power3.out',
      delay: 1.2,
    });

    // CTA buttons
    gsap.from('.hero-actions', {
      y: 24,
      autoAlpha: 0,
      duration: 0.7,
      ease: 'power3.out',
      delay: 1.4,
    });
  }

  // -- About palette swatches ----------------------------------------------
  if (!reduceMotion) {
    ScrollTrigger.batch('.palette-swatch', {
      onEnter: (elements) => {
        gsap.from(elements, {
          scale: 0,
          rotation: -15,
          autoAlpha: 0,
          duration: 0.6,
          stagger: 0.1,
          ease: 'back.out(1.7)',
        });
      },
      start: 'top 85%',
      once: true,
    });

    // About text
    gsap.from('.about-text p', {
      scrollTrigger: {
        trigger: '#about',
        start: 'top 75%',
        once: true,
      },
      y: 30,
      autoAlpha: 0,
      duration: 0.6,
      stagger: 0.15,
      ease: 'power2.out',
    });

    // Section titles
    gsap.utils.toArray<HTMLElement>('.section-title').forEach((title) => {
      gsap.from(title, {
        scrollTrigger: {
          trigger: title,
          start: 'top 85%',
          once: true,
        },
        x: -40,
        autoAlpha: 0,
        duration: 0.7,
        ease: 'power3.out',
      });
    });
  }

  // -- How It Works step cards ---------------------------------------------
  if (!reduceMotion) {
    ScrollTrigger.batch('.step-card', {
      onEnter: (elements) => {
        gsap.from(elements, {
          y: 70,
          autoAlpha: 0,
          duration: 0.7,
          stagger: 0.18,
          ease: 'power3.out',
        });
      },
      start: 'top 82%',
      once: true,
    });
  }

  // -- Feature items -------------------------------------------------------
  if (!reduceMotion) {
    ScrollTrigger.batch('.feature-item', {
      onEnter: (elements) => {
        gsap.from(elements, {
          y: 40,
          autoAlpha: 0,
          duration: 0.55,
          stagger: 0.1,
          ease: 'power2.out',
        });
      },
      start: 'top 85%',
      once: true,
    });
  }

  // -- Guide steps ---------------------------------------------------------
  if (!reduceMotion) {
    ScrollTrigger.batch('.guide-step', {
      onEnter: (elements) => {
        gsap.from(elements, {
          x: -50,
          autoAlpha: 0,
          duration: 0.5,
          stagger: 0.12,
          ease: 'power2.out',
        });
      },
      start: 'top 82%',
      once: true,
    });
  }

  // -- CTA banner ----------------------------------------------------------
  if (!reduceMotion) {
    gsap.from('#cta-banner .section-title', {
      scrollTrigger: {
        trigger: '#cta-banner',
        start: 'top 80%',
        once: true,
      },
      y: 30,
      autoAlpha: 0,
      duration: 0.6,
      ease: 'power2.out',
    });

    gsap.from('#cta-banner p', {
      scrollTrigger: {
        trigger: '#cta-banner',
        start: 'top 80%',
        once: true,
      },
      y: 20,
      autoAlpha: 0,
      duration: 0.6,
      delay: 0.1,
      ease: 'power2.out',
    });

    gsap.from('#cta-banner .btn', {
      scrollTrigger: {
        trigger: '#cta-banner',
        start: 'top 80%',
        once: true,
      },
      scale: 0.8,
      autoAlpha: 0,
      duration: 0.5,
      delay: 0.25,
      ease: 'back.out(1.6)',
    });
  }

  // -- CTA button hover ----------------------------------------------------
  const ctaEnter = document.getElementById('cta-enter');
  if (ctaEnter && !reduceMotion) {
    ctaEnter.addEventListener('mouseenter', () => {
      gsap.to(ctaEnter, { scale: 1.06, duration: 0.25, ease: 'power2.out' });
    });
    ctaEnter.addEventListener('mouseleave', () => {
      gsap.to(ctaEnter, { scale: 1, duration: 0.25, ease: 'power2.out' });
    });
  }

  // -- Feature item hover --------------------------------------------------
  if (!reduceMotion) {
    document.querySelectorAll<HTMLElement>('.feature-item').forEach((item) => {
      item.addEventListener('mouseenter', () => {
        gsap.to(item, { y: -6, duration: 0.25, ease: 'power2.out' });
      });
      item.addEventListener('mouseleave', () => {
        gsap.to(item, { y: 0, duration: 0.25, ease: 'power2.out' });
      });
    });

    // Step card hover
    document.querySelectorAll<HTMLElement>('.step-card').forEach((card) => {
      card.addEventListener('mouseenter', () => {
        gsap.to(card, { y: -6, duration: 0.25, ease: 'power2.out' });
      });
      card.addEventListener('mouseleave', () => {
        gsap.to(card, { y: 0, duration: 0.25, ease: 'power2.out' });
      });
    });

    // Palette swatch hover — scale pulse
    document.querySelectorAll<HTMLElement>('.palette-swatch').forEach((swatch) => {
      swatch.addEventListener('mouseenter', () => {
        gsap.to(swatch, { scale: 1.15, duration: 0.3, ease: 'back.out(2)' });
      });
      swatch.addEventListener('mouseleave', () => {
        gsap.to(swatch, { scale: 1, duration: 0.3, ease: 'back.out(2)' });
      });
    });
  }

  // -- Section divider line animations -------------------------------------
  if (!reduceMotion) {
    gsap.utils.toArray<HTMLElement>('.section-divider').forEach((divider) => {
      gsap.from(divider, {
        scrollTrigger: {
          trigger: divider,
          start: 'top 95%',
          once: true,
        },
        scaleX: 0,
        duration: 0.8,
        ease: 'power3.inOut',
        transformOrigin: 'left center',
      });
    });
  }
});

// ---------------------------------------------------------------------------
// Handle resize — rebuild hero grid
// ---------------------------------------------------------------------------

let resizeTimeout: number;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = window.setTimeout(() => {
    const container = document.getElementById('hero-mondrian');
    if (container) {
      container.innerHTML = '';
      const blocks = createHeroGrid();
      if (!prefersReducedMotion()) {
        gsap.from(blocks.map(b => b.el), {
          scale: 0,
          autoAlpha: 0,
          duration: 0.5,
          stagger: { amount: 0.6, from: 'random' },
          ease: 'power3.out',
        });
      }
    }
  }, 400);
});
