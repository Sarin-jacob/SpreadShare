// src/js/utils/charts.js
export class CanvasCharts {
  static getColors() {
    return ['#6366f1', '#10b981', '#8b5cf6', '#f59e0b', '#f43f5e', '#0ea5e9', '#ec4899'];
  }

  static setupCanvas(canvas) {
    if (!canvas || !canvas.parentElement) return null;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    
    // Prevent negative rendering crashes
    if (rect.width <= 0 || rect.height <= 0) return null;

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    return { ctx, width: rect.width, height: rect.height };
  }

  static drawPie(canvas, dataObject) {
    const setup = this.setupCanvas(canvas);
    if (!setup) return;
    const { ctx, width, height } = setup;

    ctx.clearRect(0, 0, width, height);

    const entries = Object.entries(dataObject).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((sum, [_, val]) => sum + val, 0);
    if (total === 0) return;

    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(centerX, centerY) - 10;
    
    // Final crash guard
    if (radius <= 0) return;

    const colors = this.getColors();
    let startAngle = -0.5 * Math.PI;
    
    entries.forEach(([label, value], index) => {
      const sliceAngle = (value / total) * 2 * Math.PI;
      const endAngle = startAngle + sliceAngle;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = colors[index % colors.length];
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = document.documentElement.classList.contains('dark') ? '#1e293b' : '#ffffff';
      ctx.stroke();
      startAngle = endAngle;
    });
  }

  static drawTrendLine(canvas, dataArray) {
    const setup = this.setupCanvas(canvas);
    if (!setup) return;
    const { ctx, width, height } = setup;

    ctx.clearRect(0, 0, width, height);
    if (!dataArray || dataArray.length === 0) return;

    const maxVal = Math.max(...dataArray, 1);
    const padding = 10;
    const stepX = (width - padding * 2) / Math.max(dataArray.length - 1, 1);

    ctx.beginPath();
    dataArray.forEach((val, i) => {
      const x = padding + (i * stepX);
      const y = height - padding - ((val / maxVal) * (height - padding * 2));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    ctx.lineWidth = 3;
    ctx.strokeStyle = '#6366f1';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    ctx.lineTo(width - padding, height);
    ctx.lineTo(padding, height);
    ctx.closePath();
    
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, 'rgba(99, 102, 241, 0.2)');
    gradient.addColorStop(1, 'rgba(99, 102, 241, 0)');
    ctx.fillStyle = gradient;
    ctx.fill();
  }
}