document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.hero, .hero-stats-bar, .page-banner, .card, .item, .stat').forEach((el, index) => {
    el.classList.add('reveal-on-scroll');
    el.style.transitionDelay = `${index * 80}ms`;
  });

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.15 });

  document.querySelectorAll('.reveal-on-scroll').forEach((el) => observer.observe(el));

  document.addEventListener('pointerdown', (event) => {
    const button = event.target.closest('.btn, .btn-join, .moderate-btn, .form-card button');
    if (!button) return;
    button.classList.add('is-pressed');
    setTimeout(() => button.classList.remove('is-pressed'), 100);
  });
});
