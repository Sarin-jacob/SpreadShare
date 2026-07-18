// src/js/components/expenseDetail.js

/**
 * Renders the exhaustive itemized transaction verification breakdown view panel layout sheet
 */
export function mountExpenseDetailComponent(containerElement, eventItemNode, onTriggerEditClick) {
  const payload = typeof eventItemNode.payload_json === 'string' ? JSON.parse(eventItemNode.payload_json) : eventItemNode.payload_json;
  const totalAmount = parseFloat(payload.evaluated_amount) || 0;
  
  document.getElementById('dtl-title').innerText = payload.title;
  document.getElementById('dtl-meta').innerText = `${payload.category || 'General'} • Logged by: ${eventItemNode.actor_identity}`;
  document.getElementById('dtl-total').innerText = `INR ${totalAmount.toFixed(2)}`;
  
  const typeBadge = document.getElementById('dtl-type-badge');
  typeBadge.innerText = eventItemNode.event_type.replace('_', ' ');

  const $allocationsList = document.getElementById('dtl-allocations-list');
  $allocationsList.innerHTML = '';

  // 1. Paint Distribution breakdowns from explicit burn logs array records
  if (eventItemNode.event_type === 'EXPENSE_ADD' && payload.allocations) {
    payload.allocations.forEach(alloc => {
      $allocationsList.innerHTML += `
        <div class="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800/60 last:border-none">
          <span class="text-slate-400">${alloc.user}</span>
          <span class="font-bold text-slate-700 dark:text-slate-300">INR ${(parseFloat(alloc.value) || 0).toFixed(2)}</span>
        </div>`;
    });
  } else if (eventItemNode.event_type === 'TRANSFER' || eventItemNode.event_type === 'LOAN') {
    const target = payload.target_peer_identity || 'recipient@email.com';
    $allocationsList.innerHTML = `
      <div class="flex justify-between items-center py-1">
        <span class="text-slate-400">Destination Peer Target:</span>
        <span class="font-bold text-accent-500">${target}</span>
      </div>`;
    if (eventItemNode.event_type === 'LOAN') {
      const rate = payload.interest_rate || 0;
      const type = payload.interest_type || 'NONE';
      $allocationsList.innerHTML += `
        <div class="flex justify-between items-center py-1 border-t border-slate-800/30">
          <span class="text-slate-400">Interest Accumulation Logic:</span>
          <span class="font-bold text-violet-400">${type} (${rate}%)</span>
        </div>`;
    }
  }

  // 2. Render files placeholder if mock data channels mimic attachments bindings
  const $receiptFrame = document.getElementById('dtl-receipt-container');
  const $receiptImg = document.getElementById('dtl-receipt-img');
  
  if (payload.has_receipt_attached || payload.receipt_local_url) {
    $receiptFrame.classList.remove('hidden');
    $receiptImg.src = payload.receipt_local_url || "https://images.unsplash.com/photo-1554415707-6e8cfc93fe23?auto=format&fit=crop&w=400&q=80";
  } else {
    $receiptFrame.classList.add('hidden');
    $receiptImg.src = "";
  }

  // Bind the edit transaction callback handler
  const editBtn = document.getElementById('dtl-btn-edit');
  // Clear out old click listener references using an anonymous node replacement override
  const clearEditBtn = editBtn.cloneNode(true);
  editBtn.parentNode.replaceChild(clearEditBtn, editBtn);
  
  clearEditBtn.addEventListener('click', () => {
    onTriggerEditClick(eventItemNode);
  });
}