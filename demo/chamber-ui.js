document.addEventListener('DOMContentLoaded', () => {
  // Only reveal individual content elements — NOT .card containers which
  // can be very tall (holding many items) and miss the threshold.
  document.querySelectorAll('.hero, .hero-stats-bar, .page-banner, .item, .stat').forEach((el, index) => {
    el.classList.add('reveal-on-scroll');
    el.style.transitionDelay = `${Math.min(index, 10) * 80}ms`;
  });

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.05 });

  document.querySelectorAll('.reveal-on-scroll').forEach((el) => observer.observe(el));

  document.addEventListener('pointerdown', (event) => {
    const button = event.target.closest('.btn, .btn-join, .moderate-btn, .form-card button');
    if (!button) return;
    button.classList.add('is-pressed');
    setTimeout(() => button.classList.remove('is-pressed'), 100);
  });
});
