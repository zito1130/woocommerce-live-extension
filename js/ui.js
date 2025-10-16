// js/ui.js
import { elements } from './constants.js';

const MAX_TOASTS = 3;

export function showToast(message, type = 'info', duration = 4000) {
    if (!elements.toastContainer) return;

    while (elements.toastContainer.children.length >= MAX_TOASTS) {
        elements.toastContainer.removeChild(elements.toastContainer.firstChild);
    }

    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;
    toast.innerHTML = `<span>${message}</span><span class="toast-close-btn">&times;</span>`;

    const closeToast = () => {
        toast.classList.add('fadeout');
        setTimeout(() => {
            if (toast.parentNode === elements.toastContainer) {
                elements.toastContainer.removeChild(toast);
            }
        }, 500);
    };

    toast.querySelector('.toast-close-btn').onclick = closeToast;
    elements.toastContainer.appendChild(toast);
    toast.classList.add('fadein');
    
    const autoCloseDuration = (type === 'loading') ? 3500 : duration;
    setTimeout(closeToast, autoCloseDuration);
}

export function openModal(product, productListData) {
    const { modal, modalProductName, modalProductQty, modalProductPrice, modalProductCall, modalStatus } = elements;
    modalProductName.textContent = `編輯：${product.name}`;
    modalProductQty.value = product.stock_quantity || 0;
    modalProductPrice.value = product.regular_price;
    const callNumberMeta = product.meta_data.find(m => m.key === 'call_number');
    modalProductCall.value = callNumberMeta ? callNumberMeta.value : '';
    modalStatus.textContent = '';
    modal.classList.remove('hidden');
    return product.id; // Return the ID for the main script to store
}

export function closeModal() {
    elements.modal.classList.add('hidden');
}

export function populateSelector(selector, items, savedId, defaultOptionText, valueField = 'id', nameField = 'name') {
    selector.innerHTML = `<option value="">-- ${defaultOptionText} --</option>`;
    items.forEach(item => {
        const option = document.createElement('option');
        option.value = item[valueField];
        option.textContent = item[nameField];
        selector.appendChild(option);
    });
    if (savedId) {
        selector.value = savedId;
    }
    selector.disabled = false;
}

export function updateDisplay(element, text, isSet) {
    if (isSet && text) {
        element.textContent = text;
        element.style.color = '#28a745';
    } else {
        element.textContent = '尚未設定';
        element.style.color = '#dc3545';
    }
}

export function suggestLiveTitle() {
    const today = new Date();
    const year = today.getFullYear().toString().slice(-2);
    const month = (today.getMonth() + 1).toString().padStart(2, '0');
    const day = today.getDate().toString().padStart(2, '0');
    return `${year}${month}${day}-01`;
}