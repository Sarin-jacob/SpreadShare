<script>
  // On-screen number pad for fields with use:numpad (see lib/numpad.svelte.js). Keys never take
  // focus, so the field keeps its caret and the pad stays open while you type.
  import { pad, press } from '../lib/numpad.svelte.js';
  import Icon from './Icon.svelte';

  const OPS = [
    ['(', ')', '/', 'back'],
    ['7', '8', '9', '*'],
    ['4', '5', '6', '-'],
    ['1', '2', '3', '+'],
    ['keyboard', '0', '.', 'done'],
  ];
  const PLAIN = [
    ['7', '8', '9', 'back'],
    ['4', '5', '6', 'keyboard'],
    ['1', '2', '3', 'done'],
    ['0', '.'],
  ];
  const SHOWN = { '/': '÷', '*': '×', '-': '−' };
  const LABELS = { back: 'Delete', keyboard: 'Use the phone keyboard', done: 'Done', '/': 'Divide', '*': 'Times', '-': 'Minus', '+': 'Plus', '(': 'Open bracket', ')': 'Close bracket' };

  let height = $state(0);
  // Room under the page so the bottom of the form can scroll above the pad.
  $effect(() => {
    document.body.style.paddingBottom = pad.target ? `${height}px` : '';
    return () => (document.body.style.paddingBottom = '');
  });

  let repeat = null;
  const stop = () => {
    clearTimeout(repeat);
    clearInterval(repeat);
    repeat = null;
  };
  function down(e, key) {
    e.preventDefault(); // keep focus (and the caret) in the field
    navigator.vibrate?.(4);
    press(key);
    if (key === 'back') repeat = setTimeout(() => (repeat = setInterval(() => press('back'), 60)), 400);
  }

  const keyClass = (key) =>
    key === 'done'
      ? 'bg-accent-600 text-white active:bg-accent-700'
      : /^[\d.]$/.test(key)
        ? 'bg-white dark:bg-slate-700 active:bg-slate-200 dark:active:bg-slate-600 text-2xl font-semibold'
        : 'bg-slate-200/80 dark:bg-slate-800 active:bg-slate-300 dark:active:bg-slate-700 text-xl font-semibold text-slate-700 dark:text-slate-200';
</script>

<svelte:window onpointerup={stop} onpointercancel={stop} />

{#if pad.target}
  <div
    class="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 dark:border-slate-800 bg-slate-100/95 dark:bg-slate-900/95 backdrop-blur px-2 pt-2 pb-safe select-none"
    bind:clientHeight={height}
    role="group"
    aria-label="Number pad"
  >
    <div class="mx-auto max-w-md grid grid-cols-4 gap-1.5 pb-2">
      {#each pad.ops ? OPS : PLAIN as row}
        {#each row as key}
          <button
            type="button"
            tabindex="-1"
            class="h-12 rounded-xl grid place-items-center transition-colors tabular-nums {keyClass(key)}
              {!pad.ops && key === 'done' ? 'row-span-2 h-auto' : ''} {!pad.ops && key === '0' ? 'col-span-2' : ''}"
            aria-label={LABELS[key] ?? key}
            onpointerdown={(e) => down(e, key)}
            onpointerleave={stop}
            onclick={(e) => e.detail === 0 && press(key)}
          >
            {#if key === 'back'}<Icon name="backspace" class="w-6 h-6" />
            {:else if key === 'keyboard'}<Icon name="keyboard" class="w-6 h-6" />
            {:else if key === 'done'}<Icon name="check" class="w-6 h-6" />
            {:else}{SHOWN[key] ?? key}{/if}
          </button>
        {/each}
      {/each}
    </div>
  </div>
{/if}
