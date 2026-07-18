// src/js/calculator.js

export class Calculator {
  /**
   * @param {HTMLElement} container - The DOM node containing the calculator UI
   * @param {Function} onUpdate - Callback fired whenever the total changes (passes total and expression)
   */
  constructor(container, onUpdate = () => {}) {
    this.container = container;
    this.onUpdate = onUpdate;
    
    // Scoped DOM queries: only looks inside THIS specific container
    this.$exprDisplay = this.container.querySelector('#calc-display-expression, .calc-display-expression');
    this.$valDisplay = this.container.querySelector('#calc-display-value, .calc-display-value');
    
    this.expression = "0";
    this.total = 0;

    // Bind methods to preserve 'this' context in event listeners
    this.handleKeyDown = this.handleKeyDown.bind(this);
    
    this.attachListeners();
  }

  processInput(val) {
    if (!val) return;

    if (val === 'C') {
      this.expression = "0";
      this.total = 0;
      if (this.$valDisplay) this.$valDisplay.innerText = "0.00";
    } else if (val === 'DEL') {
      this.expression = this.expression.slice(0, -1);
      if (this.expression === "" || this.expression === "-") this.expression = "0";
    } else {
      if (this.expression === "0" && !['+', '-', '*', '/'].includes(val)) {
        this.expression = val;
      } else {
        this.expression += val;
      }
    }

    if (this.$exprDisplay) {
      this.$exprDisplay.innerText = this.expression;
    }

    this.evaluateExpression();
  }

  evaluateExpression() {
    try {
      // Strictly sanitize input to only allow math characters before evaluation
      const sanitized = this.expression.replace(/[^0-9+\-*/().\s]/g, '');
      if (!sanitized) return;
      
      const evaluator = new Function(`return (${sanitized})`);
      const result = evaluator();
      
      if (Number.isFinite(result)) {
        this.total = result;
        if (this.$valDisplay) {
          this.$valDisplay.innerText = result.toFixed(2);
        }
      }
    } catch (err) {
      // Silent catch: allows users to type incomplete formulas like "5+" without crashing
    }

    // Trigger the callback instead of firing a global window event
    this.onUpdate(this.total, this.expression);
  }

  attachListeners() {
    // Event delegation strictly bound to this container
    this.container.addEventListener('click', (e) => {
      // Support both the old and new class names you used in your HTML
      const btn = e.target.closest('.comp-calc-btn, .calc-btn');
      if (btn) {
        e.preventDefault();
        this.processInput(btn.getAttribute('data-val'));
      }
    });

    // Hardware keyboard support
    window.addEventListener('keydown', this.handleKeyDown);
  }

  handleKeyDown(e) {
    // Smart guard: Only intercept keys if THIS calculator's container is visible on screen
    if (!this.container.offsetParent || this.container.closest('.hidden')) return;
    
    // Do not intercept if the user is typing in a text field
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    const validKeys = ['0','1','2','3','4','5','6','7','8','9','.','+','-','*','/','(',')'];
    
    if (validKeys.includes(e.key)) {
      e.preventDefault();
      this.processInput(e.key);
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      this.processInput('DEL');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.processInput('C');
    } else if (e.key === 'Enter') {
      e.preventDefault();
      // Look for the submit button specifically inside this container
      const submitBtn = this.container.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.click();
    }
  }

  reset() {
    this.processInput('C');
  }

  // Prevents memory leaks if the UI component is ever removed from the DOM
  destroy() {
    window.removeEventListener('keydown', this.handleKeyDown);
  }
}