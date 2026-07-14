// src/js/calculator.js

let currentCalcString = "0";

/**
 * Handles arithmetic keypad operations and processes real-time evaluations
 * @param {string} val - Key value from dataset token
 * @returns {Object} { expression: string, evaluated: number }
 */
export function handleKeyPress(val) {
  const exprDisplay = document.getElementById('calc-display-expression');
  const valDisplay = document.getElementById('calc-display-value');

  if (val === 'C') {
    currentCalcString = "0";
    valDisplay.innerText = "0.00";
  } else if (val === 'DEL') {
    currentCalcString = currentCalcString.slice(0, -1);
    if (currentCalcString === "" || currentCalcString === "-") currentCalcString = "0";
  } else {
    if (currentCalcString === "0" && !['+', '-', '*', '/'].includes(val)) {
      currentCalcString = val;
    } else {
      currentCalcString += val;
    }
  }

  exprDisplay.innerText = currentCalcString;

  let computedTotal = 0;
  try {
    const sanitized = currentCalcString.replace(/[^0-9+\-*/().\s]/g, '');
    const evaluator = new Function(`return (${sanitized || '0'})`);
    const result = evaluator();
    
    if (Number.isFinite(result)) {
      computedTotal = result;
      valDisplay.innerText = result.toFixed(2);
    }
  } catch (err) {
    // Keep running math expression string functional mid-composition
  }

  return {
    expression: currentCalcString,
    total: computedTotal
  };
}

export function resetCalculator() {
  currentCalcString = "0";
  document.getElementById('calc-display-expression').innerText = "0";
  document.getElementById('calc-display-value').innerText = "0.00";
}

export function initCalculator() {
  document.querySelectorAll('.calc-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const val = e.currentTarget.getAttribute('data-val');
      handleKeyPress(val);
    });
  });
}